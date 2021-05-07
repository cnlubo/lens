import { app, remote } from "electron";
import semver from "semver";
import { readFile } from "fs-extra";
import { action, computed, observable, reaction, toJS } from "mobx";
import { BaseStore } from "../base-store";
import migrations from "../../migrations/user-store";
import { getAppVersion } from "../utils/app-version";
import { kubeConfigDefaultPath, loadConfig } from "../kube-helpers";
import { appEventBus } from "../event-bus";
import logger from "../../main/logger";
import path from "path";
import { fileNameMigration } from "../../migrations/user-store";
import { ObservableToggleSet } from "../../renderer/utils";
import { DESCRIPTORS, KubeconfigSyncValue, UserPreferencesModel } from "./preferences-helpers";

export interface UserStoreModel {
  kubeConfigPath: string;
  lastSeenAppVersion: string;
  seenContexts: string[];
  preferences: UserPreferencesModel;
}

export class UserStore extends BaseStore<UserStoreModel> /* implements UserStoreFlatModel (when strict null is enabled) */ {
  constructor() {
    super({
      configName: "lens-user-store",
      migrations,
    });
  }

  @observable lastSeenAppVersion = "0.0.0";

  /**
   * used in add-cluster page for providing context
   */
  @observable kubeConfigPath = kubeConfigDefaultPath;
  @observable seenContexts = observable.set<string>();
  @observable newContexts = observable.set<string>();
  @observable allowTelemetry: boolean;
  @observable allowUntrustedCAs: boolean;
  @observable colorTheme: string;
  @observable localeTimezone: string;
  @observable downloadMirror: string;
  @observable httpsProxy?: string;
  @observable shell?: string;
  @observable downloadBinariesPath?: string;
  @observable kubectlBinariesPath?: string;

  /**
   * Download kubectl binaries matching cluster version
   */
  @observable downloadKubectlBinaries: boolean;
  @observable openAtLogin: boolean;

  /**
   * The column IDs under each configurable table ID that have been configured
   * to not be shown
   */
  hiddenTableColumns = observable.map<string, ObservableToggleSet<string>>();

  /**
   * The set of file/folder paths to be synced
   */
  syncKubeconfigEntries = observable.map<string, KubeconfigSyncValue>();

  async load(): Promise<void> {
    /**
     * This has to be here before the call to `new Config` in `super.load()`
     * as we have to make sure that file is in the expected place for that call
     */
    await fileNameMigration();
    await super.load();

    // refresh new contexts
    await this.refreshNewContexts();
    reaction(() => this.kubeConfigPath, () => this.refreshNewContexts());

    if (app) {
      // track telemetry availability
      reaction(() => this.allowTelemetry, allowed => {
        appEventBus.emit({ name: "telemetry", action: allowed ? "enabled" : "disabled" });
      });

      // open at system start-up
      reaction(() => this.openAtLogin, openAtLogin => {
        app.setLoginItemSettings({
          openAtLogin,
          openAsHidden: true,
          args: ["--hidden"]
        });
      }, {
        fireImmediately: true,
      });
    }
  }

  @computed get isNewVersion() {
    return semver.gt(getAppVersion(), this.lastSeenAppVersion);
  }

  @computed get resolvedShell(): string | undefined {
    return this.shell || process.env.SHELL || process.env.PTYSHELL;
  }

  /**
   * Checks if a column (by ID) for a table (by ID) is configured to be hidden
   * @param tableId The ID of the table to be checked against
   * @param columnIds The list of IDs the check if one is hidden
   * @returns true if at least one column under the table is set to hidden
   */
  isTableColumnHidden(tableId: string, ...columnIds: string[]): boolean {
    if (columnIds.length === 0) {
      return true;
    }

    const config = this.hiddenTableColumns.get(tableId);

    if (!config) {
      return true;
    }

    return columnIds.some(columnId => config.has(columnId));
  }

  @action
  /**
   * Toggles the hidden configuration of a table's column
   */
  toggleTableColumnVisibility(tableId: string, columnId: string) {
    this.hiddenTableColumns.get(tableId)?.toggle(columnId);
  }

  @action
  resetKubeConfigPath() {
    this.kubeConfigPath = kubeConfigDefaultPath;
  }

  @computed get isDefaultKubeConfigPath(): boolean {
    return this.kubeConfigPath === kubeConfigDefaultPath;
  }

  @action
  async resetTheme() {
    await this.whenLoaded;
    this.colorTheme = DESCRIPTORS.colorTheme.fromStore(undefined);
  }

  @action
  saveLastSeenAppVersion() {
    appEventBus.emit({ name: "app", action: "whats-new-seen" });
    this.lastSeenAppVersion = getAppVersion();
  }

  @action
  setLocaleTimezone(tz: string) {
    this.localeTimezone = tz;
  }

  protected async refreshNewContexts() {
    try {
      const kubeConfig = await readFile(this.kubeConfigPath, "utf8");

      if (kubeConfig) {
        this.newContexts.clear();
        loadConfig(kubeConfig).getContexts()
          .filter(ctx => ctx.cluster)
          .filter(ctx => !this.seenContexts.has(ctx.name))
          .forEach(ctx => this.newContexts.add(ctx.name));
      }
    } catch (err) {
      logger.error(err);
      this.resetKubeConfigPath();
    }
  }

  @action
  markNewContextsAsSeen() {
    const { seenContexts, newContexts } = this;

    this.seenContexts.replace([...seenContexts, ...newContexts]);
    this.newContexts.clear();
  }

  @action
  protected async fromStore(data: Partial<UserStoreModel> = {}) {
    const { lastSeenAppVersion, seenContexts = [], preferences, kubeConfigPath } = data;

    if (lastSeenAppVersion) {
      this.lastSeenAppVersion = lastSeenAppVersion;
    }

    if (kubeConfigPath) {
      this.kubeConfigPath = kubeConfigPath;
    }
    this.seenContexts.replace(seenContexts);

    this.httpsProxy = DESCRIPTORS.httpsProxy.fromStore(preferences?.httpsProxy);
    this.shell = DESCRIPTORS.shell.fromStore(preferences?.shell);
    this.colorTheme = DESCRIPTORS.colorTheme.fromStore(preferences?.colorTheme);
    this.localeTimezone = DESCRIPTORS.localeTimezone.fromStore(preferences?.localeTimezone);
    this.allowUntrustedCAs = DESCRIPTORS.allowUntrustedCAs.fromStore(preferences?.allowUntrustedCAs);
    this.allowTelemetry = DESCRIPTORS.allowTelemetry.fromStore(preferences?.allowTelemetry);
    this.downloadMirror = DESCRIPTORS.downloadMirror.fromStore(preferences?.downloadMirror);
    this.downloadKubectlBinaries = DESCRIPTORS.downloadKubectlBinaries.fromStore(preferences?.downloadKubectlBinaries);
    this.downloadBinariesPath = DESCRIPTORS.downloadBinariesPath.fromStore(preferences?.downloadBinariesPath);
    this.kubectlBinariesPath = DESCRIPTORS.kubectlBinariesPath.fromStore(preferences?.kubectlBinariesPath);
    this.openAtLogin = DESCRIPTORS.openAtLogin.fromStore(preferences?.openAtLogin);
    this.hiddenTableColumns.replace(DESCRIPTORS.hiddenTableColumns.fromStore(preferences?.hiddenTableColumns));
    this.syncKubeconfigEntries.replace(DESCRIPTORS.syncKubeconfigEntries.fromStore(preferences?.syncKubeconfigEntries));
  }

  toJSON(): UserStoreModel {
    const model: UserStoreModel = {
      kubeConfigPath: this.kubeConfigPath,
      lastSeenAppVersion: this.lastSeenAppVersion,
      seenContexts: Array.from(this.seenContexts),
      preferences: {
        httpsProxy: DESCRIPTORS.httpsProxy.toStore(this.httpsProxy),
        shell: DESCRIPTORS.shell.toStore(this.shell),
        colorTheme: DESCRIPTORS.colorTheme.toStore(this.colorTheme),
        localeTimezone: DESCRIPTORS.localeTimezone.toStore(this.localeTimezone),
        allowUntrustedCAs: DESCRIPTORS.allowUntrustedCAs.toStore(this.allowUntrustedCAs),
        allowTelemetry: DESCRIPTORS.allowTelemetry.toStore(this.allowTelemetry),
        downloadMirror: DESCRIPTORS.downloadMirror.toStore(this.downloadMirror),
        downloadKubectlBinaries: DESCRIPTORS.downloadKubectlBinaries.toStore(this.downloadKubectlBinaries),
        downloadBinariesPath: DESCRIPTORS.downloadBinariesPath.toStore(this.downloadBinariesPath),
        kubectlBinariesPath: DESCRIPTORS.kubectlBinariesPath.toStore(this.kubectlBinariesPath),
        openAtLogin: DESCRIPTORS.openAtLogin.toStore(this.openAtLogin),
        hiddenTableColumns: DESCRIPTORS.hiddenTableColumns.toStore(this.hiddenTableColumns),
        syncKubeconfigEntries: DESCRIPTORS.syncKubeconfigEntries.toStore(this.syncKubeconfigEntries),
      },
    };

    return toJS(model, {
      recurseEverything: true,
    });
  }
}

/**
 * Getting default directory to download kubectl binaries
 * @returns string
 */
export function getDefaultKubectlPath(): string {
  return path.join((app || remote.app).getPath("userData"), "binaries");
}
