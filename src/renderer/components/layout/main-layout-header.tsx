import React from "react";
import { observer } from "mobx-react";
import { Cluster } from "../../../main/cluster";
import { cssNames } from "../../utils";
import { NamespaceSelectFilter } from "../+namespaces/namespace-select-filter";

interface Props {
  cluster: Cluster
  className?: string
}

export const MainLayoutHeader = observer(({ cluster, className }: Props) => {
  return (
    <header className={cssNames("flex gaps align-center justify-space-between", className)}>
      <span className="cluster">{cluster.name}</span>
      <NamespaceSelectFilter />
    </header>
  );
});
