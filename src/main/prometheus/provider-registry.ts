import { CoreV1Api } from "@kubernetes/client-node";
import { Singleton } from "../../common/utils";

export type PrometheusService = {
  id: string;
  namespace: string;
  service: string;
  port: number;
};

export abstract class PrometheusProvider {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly rateAccuracy: string;
  abstract readonly isConfigurable: boolean;

  abstract getQuery(opts: Record<string, string>, queryName: string): string;
  abstract getPrometheusService(client: CoreV1Api): Promise<PrometheusService | undefined>;

  protected bytesSent(ingress: string, statuses: string): string {
    return `sum(rate(nginx_ingress_controller_bytes_sent_sum{ingress="${ingress}", status=~"${statuses}"}[${this.rateAccuracy}])) by (ingress)`;
  }
}

export class PrometheusProviderRegistry extends Singleton {
  public providers = new Map<string, PrometheusProvider>();

  getByKind(kind: string): PrometheusProvider {
    const provider = this.providers.get(kind);

    if (!provider) {
      throw new Error("Unknown Prometheus provider");
    }

    return provider;
  }

  registerProvider(provider: PrometheusProvider): this {
    if (this.providers.has(provider.id)) {
      throw new Error("Provider already registered under that kind");
    }

    this.providers.set(provider.id, provider);

    return this;
  }
}
