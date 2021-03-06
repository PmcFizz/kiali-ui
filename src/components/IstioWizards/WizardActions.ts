import { TLSStatus } from '../../types/TLSStatus';
import { WorkloadOverview } from '../../types/ServiceInfo';
import { WorkloadWeight } from './WeightedRouting';
import { Rule } from './MatchingRouting/Rules';
import { SuspendedRoute } from './SuspendTraffic';
import {
  AuthorizationPolicy,
  AuthorizationPolicyRule,
  AuthorizationPolicyWorkloadSelector,
  Condition,
  DestinationRule,
  DestinationRules,
  Gateway,
  HTTPMatchRequest,
  HTTPRoute,
  HTTPRouteDestination,
  IstioHandler,
  IstioInstance,
  IstioRule,
  LoadBalancerSettings,
  Operation,
  PeerAuthentication,
  PeerAuthenticationMutualTLSMode,
  PeerAuthenticationWorkloadSelector,
  RequestAuthentication,
  Sidecar,
  Source,
  StringMatch,
  VirtualService,
  VirtualServices,
  WorkloadEntrySelector
} from '../../types/IstioObjects';
import { serverConfig } from '../../config';
import { GatewaySelectorState } from './GatewaySelector';
import { ConsistentHashType, MUTUAL, TrafficPolicyState, UNSET } from './TrafficPolicy';
import { GatewayState } from '../../pages/IstioConfigNew/GatewayForm';
import { SidecarState } from '../../pages/IstioConfigNew/SidecarForm';
import { AuthorizationPolicyState } from '../../pages/IstioConfigNew/AuthorizationPolicyForm';
import { PeerAuthenticationState } from '../../pages/IstioConfigNew/PeerAuthenticationForm';
import { RequestAuthenticationState } from '../../pages/IstioConfigNew/RequestAuthenticationForm';
import { ThreeScaleState } from '../../pages/extensions/threescale/ThreeScaleNew/ThreeScaleNewPage';
import { Workload } from '../../types/Workload';
import { ThreeScaleCredentialsState } from './ThreeScaleCredentials';

export const WIZARD_WEIGHTED_ROUTING = 'weighted_routing';
export const WIZARD_MATCHING_ROUTING = 'matching_routing';
export const WIZARD_SUSPEND_TRAFFIC = 'suspend_traffic';

export const WIZARD_THREESCALE_LINK = '3scale_link';
export const WIZARD_THREESCALE_UNLINK = '3scale_unlink';

export const WIZARD_ENABLE_AUTO_INJECTION = 'enable_auto_injection';
export const WIZARD_DISABLE_AUTO_INJECTION = 'disable_auto_injection';
export const WIZARD_REMOVE_AUTO_INJECTION = 'remove_auto_injection';

export const SERVICE_WIZARD_ACTIONS = [WIZARD_WEIGHTED_ROUTING, WIZARD_MATCHING_ROUTING, WIZARD_SUSPEND_TRAFFIC];

export const WIZARD_TITLES = {
  [WIZARD_WEIGHTED_ROUTING]: 'Create Weighted Routing',
  [WIZARD_MATCHING_ROUTING]: 'Create Matching Routing',
  [WIZARD_SUSPEND_TRAFFIC]: 'Suspend Traffic',
  [WIZARD_THREESCALE_LINK]: 'Link a 3scale Account'
};

export const WIZARD_UPDATE_TITLES = {
  [WIZARD_WEIGHTED_ROUTING]: 'Update Weighted Routing',
  [WIZARD_MATCHING_ROUTING]: 'Update Matching Routing',
  [WIZARD_SUSPEND_TRAFFIC]: 'Update Suspended Traffic'
};

export type ServiceWizardProps = {
  show: boolean;
  type: string;
  update: boolean;
  namespace: string;
  serviceName: string;
  tlsStatus?: TLSStatus;
  workloads: WorkloadOverview[];
  virtualServices: VirtualServices;
  destinationRules: DestinationRules;
  gateways: string[];
  peerAuthentications: PeerAuthentication[];
  onClose: (changed: boolean) => void;
};

export type ServiceWizardValid = {
  mainWizard: boolean;
  vsHosts: boolean;
  tls: boolean;
  lb: boolean;
  gateway: boolean;
};

export type ServiceWizardState = {
  showWizard: boolean;
  showAdvanced: boolean;
  workloads: WorkloadWeight[];
  rules: Rule[];
  suspendedRoutes: SuspendedRoute[];
  valid: ServiceWizardValid;
  advancedOptionsValid: boolean;
  vsHosts: string[];
  trafficPolicy: TrafficPolicyState;
  gateway?: GatewaySelectorState;
};

export type WorkloadWizardValid = {
  threescale: boolean;
};

export type WorkloadWizardProps = {
  show: boolean;
  type: string;
  namespace: string;
  workload: Workload;
  rules: IstioRule[];
  onClose: (changed: boolean) => void;
};

export type WorkloadWizardState = {
  showWizard: boolean;
  valid: WorkloadWizardValid;
  threeScale: ThreeScaleCredentialsState;
};

const SERVICE_UNAVAILABLE = 503;

export const KIALI_WIZARD_LABEL = 'kiali_wizard';
export const KIALI_RELATED_LABEL = 'kiali_wizard_related';

export const fqdnServiceName = (serviceName: string, namespace: string): string => {
  return serviceName + '.' + namespace + '.' + serverConfig.istioIdentityDomain;
};

const buildHTTPMatchRequest = (matches: string[]): HTTPMatchRequest[] => {
  const matchRequests: HTTPMatchRequest[] = [];
  const matchHeaders: HTTPMatchRequest = { headers: {} };
  // Headers are grouped
  matches
    .filter(match => match.startsWith('headers'))
    .forEach(match => {
      // match follows format:  headers [<header-name>] <op> <value>
      const i0 = match.indexOf('[');
      const j0 = match.indexOf(']');
      const headerName = match.substring(i0 + 1, j0).trim();
      const i1 = match.indexOf(' ', j0 + 1);
      const j1 = match.indexOf(' ', i1 + 1);
      const op = match.substring(i1 + 1, j1).trim();
      const value = match.substring(j1 + 1).trim();
      matchHeaders.headers![headerName] = { [op]: value };
    });
  if (Object.keys(matchHeaders.headers || {}).length > 0) {
    matchRequests.push(matchHeaders);
  }
  // Rest of matches
  matches
    .filter(match => !match.startsWith('headers'))
    .forEach(match => {
      // match follows format: <name> <op> <value>
      const i = match.indexOf(' ');
      const j = match.indexOf(' ', i + 1);
      const name = match.substring(0, i).trim();
      const op = match.substring(i + 1, j).trim();
      const value = match.substring(j + 1).trim();
      matchRequests.push({
        [name]: {
          [op]: value
        }
      });
    });
  return matchRequests;
};

const parseStringMatch = (value: StringMatch): string => {
  if (value.exact) {
    return 'exact ' + value.exact;
  }
  if (value.prefix) {
    return 'prefix ' + value.prefix;
  }
  if (value.regex) {
    return 'regex ' + value.regex;
  }
  return '';
};

const parseHttpMatchRequest = (httpMatchRequest: HTTPMatchRequest): string[] => {
  const matches: string[] = [];
  // Headers
  if (httpMatchRequest.headers) {
    Object.keys(httpMatchRequest.headers).forEach(headerName => {
      const value = httpMatchRequest.headers![headerName];
      matches.push('headers [' + headerName + '] ' + parseStringMatch(value));
    });
  }
  if (httpMatchRequest.uri) {
    matches.push('uri ' + parseStringMatch(httpMatchRequest.uri));
  }
  if (httpMatchRequest.scheme) {
    matches.push('scheme ' + parseStringMatch(httpMatchRequest.scheme));
  }
  if (httpMatchRequest.method) {
    matches.push('method ' + parseStringMatch(httpMatchRequest.method));
  }
  if (httpMatchRequest.authority) {
    matches.push('authority ' + parseStringMatch(httpMatchRequest.authority));
  }
  return matches;
};

export const getGatewayName = (namespace: string, serviceName: string, gatewayNames: string[]): string => {
  let gatewayName = namespace + '/' + serviceName + '-gateway';
  if (gatewayNames.length === 0) {
    return gatewayName;
  }
  let goodName = false;
  while (!goodName) {
    if (!gatewayNames.includes(gatewayName)) {
      goodName = true;
    } else {
      // Iterate until we find a good gatewayName
      if (gatewayName.charAt(gatewayName.length - 2) === '-') {
        let version = +gatewayName.charAt(gatewayName.length - 1);
        version = version + 1;
        gatewayName = gatewayName.substr(0, gatewayName.length - 1) + version;
      } else {
        gatewayName = gatewayName + '-1';
      }
    }
  }
  return gatewayName;
};

export const buildIstioConfig = (
  wProps: ServiceWizardProps,
  wState: ServiceWizardState
): [DestinationRule, VirtualService, Gateway?, PeerAuthentication?] => {
  const wkdNameVersion: { [key: string]: string } = {};

  // DestinationRule from the labels
  const wizardDR: DestinationRule = {
    metadata: {
      namespace: wProps.namespace,
      name: wProps.serviceName,
      labels: {
        [KIALI_WIZARD_LABEL]: wProps.type
      }
    },
    spec: {
      host: fqdnServiceName(wProps.serviceName, wProps.namespace),
      subsets: wProps.workloads.map(workload => {
        // Using version
        const versionLabelName = serverConfig.istioLabels.versionLabelName;
        const versionValue = workload.labels![versionLabelName];
        const labels: { [key: string]: string } = {};
        labels[versionLabelName] = versionValue;
        // Populate helper table workloadName -> version
        wkdNameVersion[workload.name] = versionValue;
        return {
          name: versionValue,
          labels: labels
        };
      })
    }
  };

  const wizardVS: VirtualService = {
    metadata: {
      namespace: wProps.namespace,
      name: wProps.serviceName,
      labels: {
        [KIALI_WIZARD_LABEL]: wProps.type
      }
    },
    spec: {}
  };

  let wizardPA: PeerAuthentication | undefined = undefined;

  // Wizard is optional, only when user has explicitly selected "Create a Gateway"
  const fullNewGatewayName = getGatewayName(wProps.namespace, wProps.serviceName, wProps.gateways);
  const wizardGW: Gateway | undefined =
    wState.gateway && wState.gateway.addGateway && wState.gateway.newGateway
      ? {
          metadata: {
            namespace: wProps.namespace,
            name: fullNewGatewayName.substr(wProps.namespace.length + 1),
            labels: {
              [KIALI_WIZARD_LABEL]: wProps.type
            }
          },
          spec: {
            selector: {
              istio: 'ingressgateway'
            },
            servers: [
              {
                port: {
                  number: wState.gateway.port,
                  name: 'http',
                  protocol: 'HTTP'
                },
                hosts: wState.gateway.gwHosts.split(',')
              }
            ]
          }
        }
      : undefined;

  switch (wProps.type) {
    case WIZARD_WEIGHTED_ROUTING: {
      // VirtualService from the weights
      wizardVS.spec = {
        http: [
          {
            route: wState.workloads.map(workload => {
              return {
                destination: {
                  host: fqdnServiceName(wProps.serviceName, wProps.namespace),
                  subset: wkdNameVersion[workload.name]
                },
                weight: workload.weight
              };
            })
          }
        ]
      };
      break;
    }
    case WIZARD_MATCHING_ROUTING: {
      // VirtualService from the routes
      wizardVS.spec = {
        http: wState.rules.map(rule => {
          const httpRoute: HTTPRoute = {};
          httpRoute.route = [];
          for (let iRoute = 0; iRoute < rule.workloadWeights.length; iRoute++) {
            const destW: HTTPRouteDestination = {
              destination: {
                host: fqdnServiceName(wProps.serviceName, wProps.namespace),
                subset: wkdNameVersion[rule.workloadWeights[iRoute].name]
              }
            };
            destW.weight = rule.workloadWeights[iRoute].weight;
            httpRoute.route.push(destW);
          }

          if (rule.matches.length > 0) {
            httpRoute.match = buildHTTPMatchRequest(rule.matches);
          }
          return httpRoute;
        })
      };
      break;
    }
    case WIZARD_SUSPEND_TRAFFIC: {
      // VirtualService from the suspendedRoutes
      const httpRoute: HTTPRoute = {
        route: []
      };
      // Let's use the # os suspended notes to create weights
      const totalRoutes = wState.suspendedRoutes.length;
      const closeRoutes = wState.suspendedRoutes.filter(s => s.suspended).length;
      const openRoutes = totalRoutes - closeRoutes;
      let firstValue = true;
      // If we have some suspended routes, we need to use weights
      if (closeRoutes < totalRoutes) {
        for (let i = 0; i < wState.suspendedRoutes.length; i++) {
          const suspendedRoute = wState.suspendedRoutes[i];
          const destW: HTTPRouteDestination = {
            destination: {
              host: fqdnServiceName(wProps.serviceName, wProps.namespace),
              subset: wkdNameVersion[suspendedRoute.workload]
            }
          };
          if (suspendedRoute.suspended) {
            // A suspended route has a 0 weight
            destW.weight = 0;
          } else {
            destW.weight = Math.floor(100 / openRoutes);
            // We need to adjust the rest
            if (firstValue) {
              destW.weight += 100 % openRoutes;
              firstValue = false;
            }
          }
          httpRoute.route!.push(destW);
        }
      } else {
        // All routes are suspended, so we use an fault/abort rule
        httpRoute.route = [
          {
            destination: {
              host: fqdnServiceName(wProps.serviceName, wProps.namespace)
            }
          }
        ];
        httpRoute.fault = {
          abort: {
            httpStatus: SERVICE_UNAVAILABLE,
            percentage: {
              value: 100
            }
          }
        };
      }
      wizardVS.spec = {
        http: [httpRoute]
      };
      break;
    }
    default:
      console.log('Unrecognized type');
  }

  wizardVS.spec.hosts =
    wState.vsHosts.length > 1 || (wState.vsHosts.length === 1 && wState.vsHosts[0].length > 0)
      ? wState.vsHosts
      : [wProps.serviceName];

  if (wState.trafficPolicy.tlsModified && wState.trafficPolicy.mtlsMode !== UNSET) {
    wizardDR.spec.trafficPolicy = {};
    wizardDR.spec.trafficPolicy.tls = {
      mode: wState.trafficPolicy.mtlsMode,
      clientCertificate: null,
      privateKey: null,
      caCertificates: null
    };
    if (wState.trafficPolicy.mtlsMode === MUTUAL) {
      wizardDR.spec.trafficPolicy.tls.clientCertificate = wState.trafficPolicy.clientCertificate;
      wizardDR.spec.trafficPolicy.tls.privateKey = wState.trafficPolicy.privateKey;
      wizardDR.spec.trafficPolicy.tls.caCertificates = wState.trafficPolicy.caCertificates;
    }
  }

  if (wState.trafficPolicy.peerAuthnSelector.addPeerAuthentication) {
    const peerAuthnLabels: { [key: string]: string } = {};
    peerAuthnLabels[serverConfig.istioLabels.appLabelName] = wProps.workloads[0].labels![
      serverConfig.istioLabels.appLabelName
    ];

    wizardPA = {
      metadata: {
        namespace: wProps.namespace,
        name: wProps.serviceName,
        labels: {
          [KIALI_WIZARD_LABEL]: wProps.type
        }
      },
      spec: {
        selector: {
          matchLabels: peerAuthnLabels
        },
        mtls: {
          mode: wState.trafficPolicy.peerAuthnSelector.mode
        }
      }
    };

    wizardDR.metadata.annotations = {};
    wizardDR.metadata.annotations[KIALI_RELATED_LABEL] = 'PeerAuthentication/' + wProps.serviceName;
  }

  if (wState.trafficPolicy.addLoadBalancer) {
    if (!wizardDR.spec.trafficPolicy) {
      wizardDR.spec.trafficPolicy = {};
    }

    if (wState.trafficPolicy.simpleLB) {
      // Remember to put a null fields that need to be deleted on a JSON merge patch
      wizardDR.spec.trafficPolicy.loadBalancer = {
        simple: wState.trafficPolicy.loadBalancer.simple,
        consistentHash: null
      };
    } else {
      wizardDR.spec.trafficPolicy.loadBalancer = {
        simple: null,
        consistentHash: {}
      };
      wizardDR.spec.trafficPolicy.loadBalancer.consistentHash = {
        httpHeaderName: null,
        httpCookie: null,
        useSourceIp: null
      };
      if (wState.trafficPolicy.loadBalancer.consistentHash) {
        const consistentHash = wState.trafficPolicy.loadBalancer.consistentHash;
        switch (wState.trafficPolicy.consistentHashType) {
          case ConsistentHashType.HTTP_HEADER_NAME:
            wizardDR.spec.trafficPolicy.loadBalancer.consistentHash.httpHeaderName = consistentHash.httpHeaderName;
            break;
          case ConsistentHashType.HTTP_COOKIE:
            wizardDR.spec.trafficPolicy.loadBalancer.consistentHash.httpCookie = consistentHash.httpCookie;
            break;
          case ConsistentHashType.USE_SOURCE_IP:
            wizardDR.spec.trafficPolicy.loadBalancer.consistentHash.useSourceIp = true;
            break;
          default:
          /// No default action
        }
      }
    }
  }

  // If traffic policy has empty objects, it will be invalidated because galleys expects at least one non-empty field.
  if (!wizardDR.spec.trafficPolicy) {
    wizardDR.spec.trafficPolicy = null;
  }

  // If there isn't any PeerAuthn created/updated, remove the DR annotation
  if (!wizardPA) {
    // @ts-ignore
    wizardDR.metadata.annotations = null;
  }

  if (wState.gateway && wState.gateway.addGateway) {
    wizardVS.spec.gateways = [wState.gateway.newGateway ? fullNewGatewayName : wState.gateway.selectedGateway];
    if (wState.gateway.addMesh) {
      wizardVS.spec.gateways.push('mesh');
    }
  } else {
    wizardVS.spec.gateways = null;
  }

  return [wizardDR, wizardVS, wizardGW, wizardPA];
};

const getWorkloadsByVersion = (workloads: WorkloadOverview[]): { [key: string]: string } => {
  const versionLabelName = serverConfig.istioLabels.versionLabelName;
  const wkdVersionName: { [key: string]: string } = {};
  workloads.forEach(workload => (wkdVersionName[workload.labels![versionLabelName]] = workload.name));
  return wkdVersionName;
};

export const getDefaultWeights = (workloads: WorkloadOverview[]): WorkloadWeight[] => {
  const wkTraffic = workloads.length < 100 ? Math.floor(100 / workloads.length) : 0;
  const remainTraffic = workloads.length < 100 ? 100 % workloads.length : 0;
  const wkWeights: WorkloadWeight[] = workloads.map(workload => ({
    name: workload.name,
    weight: wkTraffic,
    locked: false,
    maxWeight: 100
  }));
  if (remainTraffic > 0) {
    wkWeights[wkWeights.length - 1].weight = wkWeights[wkWeights.length - 1].weight + remainTraffic;
  }
  return wkWeights;
};

export const getInitWeights = (workloads: WorkloadOverview[], virtualServices: VirtualServices): WorkloadWeight[] => {
  const wkdVersionName = getWorkloadsByVersion(workloads);
  const wkdWeights: WorkloadWeight[] = [];
  if (virtualServices.items.length === 1 && virtualServices.items[0].spec.http!.length === 1) {
    // Populate WorkloadWeights from a VirtualService
    virtualServices.items[0].spec.http![0].route!.forEach(route => {
      // A wkdVersionName[route.destination.subset] === undefined may indicate that a VS contains a removed workload
      // Checking before to add it to the Init Weights
      if (route.destination.subset && wkdVersionName[route.destination.subset]) {
        wkdWeights.push({
          name: wkdVersionName[route.destination.subset],
          weight: route.weight || 0,
          locked: false,
          maxWeight: 100
        });
      }
    });
  }
  // Add new workloads with 0 weight if there is missing workloads
  if (wkdWeights.length > 0 && workloads.length !== wkdWeights.length) {
    for (let i = 0; i < workloads.length; i++) {
      const wkd = workloads[i];
      let newWkd = true;
      for (let j = 0; j < wkdWeights.length; j++) {
        const wkdWeight = wkdWeights[j];
        if (wkd.name === wkdWeight.name) {
          newWkd = false;
          break;
        }
      }
      if (newWkd) {
        wkdWeights.push({
          name: wkd.name,
          weight: 0,
          locked: false,
          maxWeight: 100
        });
      }
    }
  }
  return wkdWeights;
};

export const getInitRules = (workloads: WorkloadOverview[], virtualServices: VirtualServices): Rule[] => {
  const wkdVersionName = getWorkloadsByVersion(workloads);
  const rules: Rule[] = [];
  if (virtualServices.items.length === 1) {
    virtualServices.items[0].spec.http!.forEach(httpRoute => {
      const rule: Rule = {
        matches: [],
        workloadWeights: []
      };
      if (httpRoute.match) {
        httpRoute.match.forEach(m => (rule.matches = rule.matches.concat(parseHttpMatchRequest(m))));
      }
      if (httpRoute.route) {
        httpRoute.route.forEach(r => {
          const subset = r.destination.subset;
          const workload = wkdVersionName[subset || ''];
          // Not adding a route if a workload is not found with a destination subset
          // That means that a workload has been deleted after a VS/DR has been generated
          if (workload) {
            rule.workloadWeights.push({
              name: workload,
              weight: r.weight ? r.weight : 0,
              locked: false,
              maxWeight: 100
            });
          }
        });
      }
      // Not adding a rule if it has empty routes, probably this means that an existing workload was removed
      if (rule.workloadWeights.length > 0) {
        rules.push(rule);
      }
    });
  }
  return rules;
};

export const getInitSuspendedRoutes = (
  workloads: WorkloadOverview[],
  virtualServices: VirtualServices
): SuspendedRoute[] => {
  const wkdVersionName = getWorkloadsByVersion(workloads);
  const routes: SuspendedRoute[] = workloads.map(wk => ({
    workload: wk.name,
    suspended: true,
    httpStatus: SERVICE_UNAVAILABLE
  }));
  if (virtualServices.items.length === 1 && virtualServices.items[0].spec.http!.length === 1) {
    // All routes are suspended default value is correct
    if (virtualServices.items[0].spec.http![0].fault) {
      return routes;
    }
    // Iterate on route weights to identify the suspended routes
    virtualServices.items[0].spec.http![0].route!.forEach(route => {
      if (route.weight && route.weight > 0) {
        const workloadName = wkdVersionName[route.destination.subset || ''];
        routes.filter(w => w.workload === workloadName).forEach(w => (w.suspended = false));
      }
    });
  }
  return routes;
};

export const getInitTlsMode = (destinationRules: DestinationRules): [string, string, string, string] => {
  if (
    destinationRules.items.length === 1 &&
    destinationRules.items[0].spec.trafficPolicy &&
    destinationRules.items[0].spec.trafficPolicy.tls
  ) {
    return [
      destinationRules.items[0].spec.trafficPolicy.tls.mode || '',
      destinationRules.items[0].spec.trafficPolicy.tls.clientCertificate || '',
      destinationRules.items[0].spec.trafficPolicy.tls.privateKey || '',
      destinationRules.items[0].spec.trafficPolicy.tls.caCertificates || ''
    ];
  }
  return ['', '', '', ''];
};

export const getInitLoadBalancer = (destinationRules: DestinationRules): LoadBalancerSettings | undefined => {
  if (
    destinationRules.items.length === 1 &&
    destinationRules.items[0].spec.trafficPolicy &&
    destinationRules.items[0].spec.trafficPolicy.loadBalancer
  ) {
    return destinationRules.items[0].spec.trafficPolicy.loadBalancer;
  }
  return undefined;
};

export const getInitPeerAuthentication = (
  destinationRules: DestinationRules,
  peerAuthentications: PeerAuthentication[]
): PeerAuthenticationMutualTLSMode | undefined => {
  let paMode: PeerAuthenticationMutualTLSMode | undefined;
  if (
    destinationRules.items.length === 1 &&
    destinationRules.items[0].metadata.annotations &&
    destinationRules.items[0].metadata.annotations[KIALI_RELATED_LABEL]
  ) {
    let related = destinationRules.items[0].metadata.annotations[KIALI_RELATED_LABEL].split('/');
    if (related.length > 1) {
      const peerAuthn = peerAuthentications.find(
        (value: PeerAuthentication): boolean => value.metadata.name === related[1]
      );
      if (peerAuthn) {
        paMode = peerAuthn.spec!.mtls!.mode;
      }
    }
  }
  return paMode;
};

export const hasGateway = (virtualServices: VirtualServices): boolean => {
  // We need to if sentence, otherwise a potential undefined is not well handled
  if (
    virtualServices.items.length === 1 &&
    virtualServices.items[0] &&
    virtualServices.items[0].spec.gateways &&
    virtualServices.items[0].spec.gateways.length > 0
  ) {
    return true;
  }
  return false;
};

export const getInitHosts = (virtualServices: VirtualServices): string[] => {
  if (virtualServices.items.length === 1 && virtualServices.items[0] && virtualServices.items[0].spec.hosts) {
    return virtualServices.items[0].spec.hosts;
  }
  return [];
};

// VirtualServices added from the Kiali Wizard only support to add a single gateway
// and optionally a mesh gateway.
// This method returns a gateway selected by the user and if mesh is present
export const getInitGateway = (virtualServices: VirtualServices): [string, boolean] => {
  if (
    virtualServices.items.length === 1 &&
    virtualServices.items[0] &&
    virtualServices.items[0].spec.gateways &&
    virtualServices.items[0].spec.gateways.length > 0
  ) {
    let selectedGateway = virtualServices.items[0].spec.gateways[0];
    if (selectedGateway === 'mesh') {
      // In Kiali Wizard, the first gateway is reserved for user gateway
      selectedGateway = '';
    }
    let meshPresent = false;
    if (virtualServices.items[0].spec.gateways.includes('mesh')) {
      meshPresent = true;
    }
    return [selectedGateway, meshPresent];
  }
  return ['', false];
};

export const buildAuthorizationPolicy = (
  name: string,
  namespace: string,
  state: AuthorizationPolicyState
): AuthorizationPolicy => {
  const ap: AuthorizationPolicy = {
    metadata: {
      name: name,
      namespace: namespace,
      labels: {
        [KIALI_WIZARD_LABEL]: 'AuthorizationPolicy'
      }
    },
    spec: {}
  };

  // DENY_ALL and ALLOW_ALL are two specific cases
  if (state.policy === 'DENY_ALL') {
    return ap;
  }

  if (state.policy === 'ALLOW_ALL') {
    ap.spec.rules = [{}];
    return ap;
  }

  // RULES use case
  if (state.workloadSelector.length > 0) {
    const workloadSelector: AuthorizationPolicyWorkloadSelector = {
      matchLabels: {}
    };
    state.workloadSelector.split(',').forEach(label => {
      label = label.trim();
      const labelDetails = label.split('=');
      if (labelDetails.length === 2) {
        workloadSelector.matchLabels[labelDetails[0]] = labelDetails[1];
      }
    });
    ap.spec.selector = workloadSelector;
  }

  if (state.rules.length > 0) {
    ap.spec.rules = [];
    state.rules.forEach(rule => {
      const appRule: AuthorizationPolicyRule = {
        from: undefined,
        to: undefined,
        when: undefined
      };
      if (rule.from.length > 0) {
        appRule.from = rule.from.map(fromItem => {
          const source: Source = {};
          Object.keys(fromItem).forEach(key => {
            source[key] = fromItem[key];
          });
          return {
            source: source
          };
        });
      }
      if (rule.to.length > 0) {
        appRule.to = rule.to.map(toItem => {
          const operation: Operation = {};
          Object.keys(toItem).forEach(key => {
            operation[key] = toItem[key];
          });
          return {
            operation: operation
          };
        });
      }
      if (rule.when.length > 0) {
        appRule.when = rule.when.map(condition => {
          const cond: Condition = {
            key: condition.key
          };
          if (condition.values && condition.values.length > 0) {
            cond.values = condition.values;
          }
          if (condition.notValues && condition.notValues.length > 0) {
            cond.notValues = condition.notValues;
          }
          return cond;
        });
      }
      ap.spec.rules!.push(appRule);
    });
  }
  if (state.action.length > 0) {
    ap.spec.action = state.action;
  }
  return ap;
};

export const buildGateway = (name: string, namespace: string, state: GatewayState): Gateway => {
  const gw: Gateway = {
    metadata: {
      name: name,
      namespace: namespace,
      labels: {
        [KIALI_WIZARD_LABEL]: 'Gateway'
      }
    },
    spec: {
      // Default for istio scenarios, user may change it editing YAML
      selector: {
        istio: 'ingressgateway'
      },
      servers: state.gatewayServers.map(s => ({
        port: {
          number: +s.portNumber,
          protocol: s.portProtocol,
          name: s.portName
        },
        hosts: s.hosts
      }))
    }
  };
  return gw;
};

export const buildPeerAuthentication = (
  name: string,
  namespace: string,
  state: PeerAuthenticationState
): PeerAuthentication => {
  const pa: PeerAuthentication = {
    metadata: {
      name: name,
      namespace: namespace,
      labels: {
        [KIALI_WIZARD_LABEL]: 'PeerAuthentication'
      }
    },
    spec: {}
  };

  if (state.workloadSelector.length > 0) {
    const workloadSelector: PeerAuthenticationWorkloadSelector = {
      matchLabels: {}
    };
    state.workloadSelector.split(',').forEach(label => {
      label = label.trim();
      const labelDetails = label.split('=');
      if (labelDetails.length === 2) {
        workloadSelector.matchLabels[labelDetails[0]] = labelDetails[1];
      }
    });
    pa.spec.selector = workloadSelector;
  }

  // Kiali is always adding this field
  pa.spec.mtls = {
    mode: PeerAuthenticationMutualTLSMode[state.mtls]
  };

  if (state.portLevelMtls.length > 0) {
    pa.spec.portLevelMtls = {};
    state.portLevelMtls.forEach(p => {
      if (pa.spec.portLevelMtls) {
        pa.spec.portLevelMtls[Number(p.port)] = {
          mode: PeerAuthenticationMutualTLSMode[p.mtls]
        };
      }
    });
  }

  return pa;
};

export const buildRequestAuthentication = (
  name: string,
  namespace: string,
  state: RequestAuthenticationState
): RequestAuthentication => {
  const ra: RequestAuthentication = {
    metadata: {
      name: name,
      namespace: namespace,
      labels: {
        [KIALI_WIZARD_LABEL]: 'RequestAuthentication'
      }
    },
    spec: {
      jwtRules: []
    }
  };

  if (state.workloadSelector.length > 0) {
    const workloadSelector: WorkloadEntrySelector = {
      matchLabels: {}
    };
    state.workloadSelector.split(',').forEach(label => {
      label = label.trim();
      const labelDetails = label.split('=');
      if (labelDetails.length === 2) {
        workloadSelector.matchLabels[labelDetails[0]] = labelDetails[1];
      }
    });
    ra.spec.selector = workloadSelector;
  }

  if (state.jwtRules.length > 0) {
    ra.spec.jwtRules = state.jwtRules;
  }
  return ra;
};

export const buildSidecar = (name: string, namespace: string, state: SidecarState): Sidecar => {
  const sc: Sidecar = {
    metadata: {
      name: name,
      namespace: namespace,
      labels: {
        [KIALI_WIZARD_LABEL]: 'Sidecar'
      }
    },
    spec: {
      egress: [
        {
          hosts: state.egressHosts.map(eh => eh.host)
        }
      ]
    }
  };
  if (state.addWorkloadSelector && state.workloadSelectorValid) {
    sc.spec.workloadSelector = {
      labels: {}
    };
    state.workloadSelectorLabels
      .trim()
      .split(',')
      .forEach(split => {
        const labels = split.trim().split('=');
        // It should be already validated with workloadSelectorValid, but just to add extra safe check
        if (sc.spec.workloadSelector && labels.length === 2) {
          sc.spec.workloadSelector.labels[labels[0].trim()] = labels[1].trim();
        }
      });
  }
  return sc;
};

export const buildThreeScaleHandler = (name: string, namespace: string, state: ThreeScaleState): IstioHandler => {
  const threeScaleHandler: IstioHandler = {
    metadata: {
      name: name,
      namespace: namespace,
      labels: {
        [KIALI_WIZARD_LABEL]: 'threescale'
      }
    },
    spec: {
      adapter: serverConfig.extensions?.threescale.adapterName,
      connection: {
        address:
          'dns:///' +
          serverConfig.extensions?.threescale.adapterService +
          ':' +
          serverConfig.extensions?.threescale.adapterPort
      },
      params: {
        access_token: state.token,
        system_url: state.url
      }
    }
  };
  return threeScaleHandler;
};

export const buildThreeScaleInstance = (name: string, namespace: string): IstioInstance => {
  const threeScaleInstance: IstioInstance = {
    metadata: {
      name: name,
      namespace: namespace,
      labels: {
        [KIALI_WIZARD_LABEL]: 'threescale'
      }
    },
    spec: {
      params: {
        action: {
          method: 'request.method | "get"',
          path: 'request.url_path',
          service: 'destination.labels["service-mesh.3scale.net/service-id"] | ""'
        },
        subject: {
          properties: {
            app_id: 'request.query_params["app_id"] | request.headers["app-id"] | ""',
            app_key: 'request.query_params["app_key"] | request.headers["app-key"] | ""',
            client_id: 'request.auth.claims["azp"] | ""'
          },
          user: 'request.query_params["user_key"] | request.headers["x-user-key"] | ""'
        }
      },
      template: serverConfig.extensions?.threescale.templateName
    }
  };
  return threeScaleInstance;
};

export const buildThreeScaleRule = (name: string, namespace: string, state: ThreeScaleState): IstioRule => {
  const threeScaleRule: IstioRule = {
    metadata: {
      name: name,
      namespace: namespace,
      labels: {
        [KIALI_WIZARD_LABEL]: 'threescale'
      }
    },
    spec: {
      actions: [
        {
          handler: state.handler + '.handler.' + namespace,
          instances: [name + '.instance.' + namespace]
        }
      ],
      match:
        'context.reporter.kind == "inbound" && destination.labels["service-mesh.3scale.net/credentials"] == "' +
        name +
        '" && destination.labels["service-mesh.3scale.net/authentication-method"] == ""'
    }
  };
  return threeScaleRule;
};

// Not reading these constants from serverConfig as they are part of the 3scale templates that are coded on WizardActions.ts
// Probably any change on these labels will require modifications both in backend/frontend
export const THREESCALE_LABEL_SERVICE_ID = 'service-mesh.3scale.net/service-id';
export const THREESCALE_LABEL_CREDENTIALS = 'service-mesh.3scale.net/credentials';
export const THREESCALE_LABEL_AUTHENTICATION = 'service-mesh.3scale.net/authentication-method';

export const isThreeScaleLinked = (workload: Workload): boolean => {
  return (
    THREESCALE_LABEL_SERVICE_ID in workload.labels &&
    workload.labels[THREESCALE_LABEL_SERVICE_ID] !== '' &&
    THREESCALE_LABEL_CREDENTIALS in workload.labels &&
    workload.labels[THREESCALE_LABEL_CREDENTIALS] !== ''
  );
};

export const buildWorkloadThreeScalePatch = (
  enable: boolean,
  workloadType: string,
  serviceId: string,
  credentials: string
): string => {
  // Raw Pods as workloads are rare but we need to support them
  const patch = {};
  const labels = {};
  labels[THREESCALE_LABEL_SERVICE_ID] = enable ? serviceId : null;
  labels[THREESCALE_LABEL_CREDENTIALS] = enable ? credentials : null;
  labels[THREESCALE_LABEL_AUTHENTICATION] = enable ? '' : null;
  if (workloadType === 'Pod') {
    patch['labels'] = labels;
  } else {
    patch['spec'] = {
      template: {
        metadata: {
          labels: labels
        }
      }
    };
  }
  return JSON.stringify(patch);
};

export const buildNamespaceInjectionPatch = (enable: boolean, remove: boolean): string => {
  const labels = {};
  labels[serverConfig.istioLabels.injectionLabelName] = remove ? null : enable ? 'enabled' : 'disabled';
  const patch = {
    metadata: {
      labels: labels
    }
  };
  return JSON.stringify(patch);
};

export const buildWorkloadInjectionPatch = (workloadType: string, enable: boolean, remove: boolean): string => {
  const patch = {};
  const annotations = {};
  annotations[serverConfig.istioAnnotations.istioInjectionAnnotation] = remove ? null : enable ? 'true' : 'false';
  if (workloadType === 'Pod') {
    patch['annotations'] = annotations;
  } else {
    patch['spec'] = {
      template: {
        metadata: {
          annotations: annotations
        }
      }
    };
  }
  return JSON.stringify(patch);
};
