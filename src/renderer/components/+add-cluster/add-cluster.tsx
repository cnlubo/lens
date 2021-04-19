import "./add-cluster.scss";

import { KubeConfig } from "@kubernetes/client-node";
import fse from "fs-extra";
import { debounce } from "lodash";
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import path from "path";
import React from "react";

import { catalogURL } from "../+catalog";
import { ClusterStore } from "../../../common/cluster-store";
import { appEventBus } from "../../../common/event-bus";
import { loadConfigFromString, splitConfig } from "../../../common/kube-helpers";
import { docsUrl } from "../../../common/vars";
import { navigate } from "../../navigation";
import { iter } from "../../utils";
import { AceEditor } from "../ace-editor";
import { Button } from "../button";
import { PageLayout } from "../layout/page-layout";
import { Notifications } from "../notifications";

interface Option {
  config: KubeConfig;
  error?: string;
}

function getContexts(config: KubeConfig): Map<string, Option> {
  return new Map(
    splitConfig(config)
      .map(({ config, error }) => [config.currentContext, {
        config,
        error,
      }])
  );
}

@observer
export class AddCluster extends React.Component {
  @observable kubeContexts = observable.map<string, Option>();
  @observable customConfig = "";
  @observable isWaiting = false;
  @observable errorText: string;

  componentDidMount() {
    appEventBus.emit({ name: "cluster-add", action: "start" });
  }

  @computed get allErrors(): string[] {
    return [
      this.errorText,
      ...iter.map(this.kubeContexts.values(), ({ error }) => error)
    ].filter(Boolean);
  }

  @action
  refreshContexts = debounce(() => {
    const { config, error } = loadConfigFromString(this.customConfig.trim() || "{}");

    this.kubeContexts.replace(getContexts(config));
    this.errorText = error?.toString();
  }, 500);

  @action
  addClusters = async () => {
    this.isWaiting = true;
    appEventBus.emit({ name: "cluster-add", action: "click" });

    try {
      const absPath = ClusterStore.getCustomKubeConfigPath();

      await fse.ensureDir(path.dirname(absPath));
      await fse.writeFile(absPath, this.customConfig.trim(), { encoding: "utf-8", mode: 0o600 });

      Notifications.ok(`Successfully added ${this.kubeContexts.size} new cluster(s)`);

      return navigate(catalogURL());
    } catch (error) {
      Notifications.error(`Failed to add clusters: ${error}`);
    }
  };

  render() {
    return (
      <PageLayout className="AddClusters" showOnTop={true}>
        <h2>Add Clusters from Kubeconfig</h2>
        <p>
          Clusters added here are <b>not</b> merged into the <code>~/.kube/config</code> file.
          Read more about adding clusters <a href={`${docsUrl}/clusters/adding-clusters/`} rel="noreferrer" target="_blank">here</a>.
        </p>
        <div className="flex column">
          <AceEditor
            autoFocus
            showGutter={false}
            mode="yaml"
            value={this.customConfig}
            onChange={value => {
              this.customConfig = value;
              this.errorText = "";
              this.refreshContexts();
            }}
          />
        </div>
        {this.allErrors.length > 0 && (
          <>
            <h3>KubeConfig Yaml Validation Errors:</h3>
            {...this.allErrors.map(error => <div key={error} className="error">{error}</div>)}
          </>
        )}
        <div className="actions-panel">
          <Button
            primary
            disabled={this.kubeContexts.size === 0}
            label={this.kubeContexts.size === 1 ? "Add cluster" : "Add clusters"}
            onClick={this.addClusters}
            waiting={this.isWaiting}
            tooltip={this.kubeContexts.size === 0 || "Paste in at least one cluster to add."}
            tooltipOverrideDisabled
          />
        </div>
      </PageLayout>
    );
  }
}
