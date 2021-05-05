import { LensRendererExtension, Interface, Catalog, Component} from "@k8slens/extensions";
import { MetricsFeature } from "./src/metrics-feature";

async function poll<T>(fn: () => Promise<T>, until: (val: T) => boolean, restPeriodMs: number): Promise<void> {
  for(;;) {
    if (until(await fn())) {
      return;
    }

    await new Promise(resolve => setTimeout(resolve, restPeriodMs));
  }
}

export default class ClusterMetricsFeatureExtension extends LensRendererExtension {
  features = new Map<string, MetricsFeature>();

  onActivate() {
    const category = Catalog.catalogCategories.getForGroupKind<Catalog.KubernetesClusterCategory>("entity.k8slens.dev", "KubernetesCluster");

    if (!category) {
      return;
    }

    category.on("contextMenuOpen", this.clusterContextMenuOpen.bind(this));
  }

  onDeactivate() {
    this.features.clear();
  }

  async clusterContextMenuOpen(cluster: Catalog.KubernetesCluster, ctx: Interface.CatalogEntityContextMenuContext) {
    if (!cluster.status.active) {
      return;
    }

    if (!this.features.has(cluster.getId())) {
      this.features.set(cluster.getId(), new MetricsFeature(cluster));
    }

    const metricsFeature = this.features.get(cluster.getId());

    await metricsFeature.updateStatus();

    if (metricsFeature.status.installed) {
      if (metricsFeature.status.canUpgrade) {
        ctx.menuItems.unshift({
          icon: "refresh",
          title: "Upgrade Lens Metrics stack",
          onClick: async () => {
            try {
              const remove = Component.Notifications.info(`Lens Metrics is being upgraded on ${cluster.metadata.name}`, { timeout: 7_500 });

              await metricsFeature.upgrade();
              await poll(() => metricsFeature.updateStatus(), ({ installed, canUpgrade }) => installed && !canUpgrade, 5_000);

              remove();
              Component.Notifications.info(`Lens Metrics has been upgraded on ${cluster.metadata.name}`, { timeout: 7_500 });
            } catch (error) {
              Component.Notifications.error(`Lens Metrics failed to be upgraded on ${cluster.metadata.name}: ${error}`);
            }
          }
        });
      }
      ctx.menuItems.unshift({
        icon: "toggle_off",
        title: "Uninstall Lens Metrics stack",
        onClick: async () => {
          try {
            const remove = Component.Notifications.info(`Lens Metrics is being removed from ${cluster.metadata.name}`, { timeout: 7_500 });

            await metricsFeature.uninstall();
            await poll(() => metricsFeature.updateStatus(), ({ installed }) => !installed, 5_000);

            remove();
            Component.Notifications.info(`Lens Metrics has been removed from ${cluster.metadata.name}`, { timeout: 7_500 });
          } catch (error) {
            Component.Notifications.error(`Lens Metrics failed to be removed from ${cluster.metadata.name}: ${error}`);
          }
        }
      });
    } else {
      ctx.menuItems.unshift({
        icon: "toggle_on",
        title: "Install Lens Metrics stack",
        onClick: async () => {
          try {
            const remove = Component.Notifications.info(`Lens Metrics is being installed to ${cluster.metadata.name}`, { timeout: 7_500 });

            await metricsFeature.install();
            await poll(() => metricsFeature.updateStatus(), ({ installed }) => installed, 5_000);

            remove();
            Component.Notifications.info(`Lens Metrics has been installed to ${cluster.metadata.name}`, { timeout: 7_500 });
          } catch (error) {
            Component.Notifications.error(`Lens Metrics failed to be installed to ${cluster.metadata.name}: ${error}`);
          }
        }
      });
    }
  }
}
