import { PrometheusHelm } from "./helm";
import { PrometheusLens } from "./lens";
import { PrometheusOperator } from "./operator";
import { PrometheusProviderRegistry } from "./provider-registry";
import { PrometheusStacklight } from "./stacklight";

export * from "./provider-registry";

export function registerDefaultPrometheusProviders() {
  PrometheusProviderRegistry
    .getInstance()
    .registerProvider(new PrometheusLens())
    .registerProvider(new PrometheusHelm())
    .registerProvider(new PrometheusOperator())
    .registerProvider(new PrometheusStacklight());
}
