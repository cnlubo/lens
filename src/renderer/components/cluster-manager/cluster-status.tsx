import "./cluster-status.scss";

import { ipcRenderer } from "electron";
import { computed, observable } from "mobx";
import { observer } from "mobx-react";
import React from "react";

import { clusterActivateHandler } from "../../../common/cluster-ipc";
import { ClusterId, ClusterStore } from "../../../common/cluster-store";
import { requestMain, subscribeToBroadcast } from "../../../common/ipc";
import { Cluster } from "../../../main/cluster";
import { cssNames, IClassName } from "../../utils";
import { Button } from "../button";
import { Icon } from "../icon";
import { CubeSpinner } from "../spinner";

import type { KubeAuthProxyLog } from "../../../main/kube-auth-proxy";
import { navigate } from "../../navigation";
import { entitySettingsURL } from "../+entity-settings";

interface Props {
  className?: IClassName;
  clusterId: ClusterId;
}

@observer
export class ClusterStatus extends React.Component<Props> {
  @observable authOutput: KubeAuthProxyLog[] = [];
  @observable isReconnecting = false;

  get cluster(): Cluster {
    return ClusterStore.getInstance().getById(this.props.clusterId);
  }

  @computed get hasErrors(): boolean {
    return this.authOutput.some(({ error }) => error) || !!this.cluster.failureReason;
  }

  async componentDidMount() {
    subscribeToBroadcast(`kube-auth:${this.cluster.id}`, (evt, res: KubeAuthProxyLog) => {
      this.authOutput.push({
        data: res.data.trimRight(),
        error: res.error,
      });
    });
  }

  componentWillUnmount() {
    ipcRenderer.removeAllListeners(`kube-auth:${this.props.clusterId}`);
  }

  activateCluster = async (force = false) => {
    await requestMain(clusterActivateHandler, this.props.clusterId, force);
  };

  reconnect = async () => {
    this.authOutput = [];
    this.isReconnecting = true;
    await this.activateCluster(true);
    this.isReconnecting = false;
  };

  manageProxySettings = () => {
    navigate(entitySettingsURL({
      params: {
        entityId: this.props.clusterId,
      },
      fragment: "http-proxy",
    }));
  };

  renderContent() {
    const { authOutput, cluster, hasErrors } = this;
    const failureReason = cluster.failureReason;

    if (!hasErrors || this.isReconnecting) {
      return (
        <>
          <CubeSpinner/>
          <pre className="kube-auth-out">
            <p>{this.isReconnecting ? "Reconnecting..." : "Connecting..."}</p>
            {authOutput.map(({ data, error }, index) => {
              return <p key={index} className={cssNames({ error })}>{data}</p>;
            })}
          </pre>
        </>
      );
    }

    return (
      <>
        <Icon material="cloud_off" className="error"/>
        <h2>
          {cluster.preferences.clusterName}
        </h2>
        <pre className="kube-auth-out">
          {authOutput.map(({ data, error }, index) => {
            return <p key={index} className={cssNames({ error })}>{data}</p>;
          })}
        </pre>
        {failureReason && (
          <div className="failure-reason error">{failureReason}</div>
        )}
        <Button
          primary
          label="Reconnect"
          className="box center"
          onClick={this.reconnect}
          waiting={this.isReconnecting}
        />
        <Button
          primary
          label="Manage Proxy Settings"
          className="box center"
          onClick={this.manageProxySettings}
        />
      </>
    );
  }

  render() {
    return (
      <div className={cssNames("ClusterStatus flex column gaps box center align-center justify-center", this.props.className)}>
        {this.renderContent()}
      </div>
    );
  }
}
