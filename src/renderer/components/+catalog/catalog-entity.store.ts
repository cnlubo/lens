import { action, computed, IReactionDisposer, observable, reaction, makeObservable } from "mobx";
import { catalogEntityRegistry } from "../../api/catalog-entity-registry";
import { CatalogEntity, CatalogEntityActionContext } from "../../api/catalog-entity";
import { ItemObject, ItemStore } from "../../item.store";
import { autoBind } from "../../utils";
import { CatalogCategory } from "../../../common/catalog";

export class CatalogEntityItem implements ItemObject {
  constructor(public entity: CatalogEntity) {
    makeObservable(this);
  }

  get name() {
    return this.entity.metadata.name;
  }

  getName() {
    return this.entity.metadata.name;
  }

  get id() {
    return this.entity.metadata.uid;
  }

  getId() {
    return this.id;
  }

  @computed get phase() {
    return this.entity.status.phase;
  }

  get labels() {
    const labels: string[] = [];

    Object.keys(this.entity.metadata.labels).forEach((key) => {
      const value = this.entity.metadata.labels[key];

      labels.push(`${key}=${value}`);
    });

    return labels;
  }

  get source() {
    return this.entity.metadata.source || "unknown";
  }

  get searchFields() {
    return [
      this.name,
      this.id,
      this.phase,
      ...this.labels.map((value, key) => `${key}=${value}`)
    ];
  }

  onRun(ctx: CatalogEntityActionContext) {
    this.entity.onRun(ctx);
  }

  @action
  async onContextMenuOpen(ctx: any) {
    return this.entity.onContextMenuOpen(ctx);
  }
}

export class CatalogEntityStore extends ItemStore<CatalogEntityItem> {
  @observable activeCategory?: CatalogCategory;

  constructor() {
    super();

    makeObservable(this);
    autoBind(this);
  }

  @computed get entities() {
    if (!this.activeCategory) {
      return catalogEntityRegistry.items.map(entity => new CatalogEntityItem(entity));
    }

    return catalogEntityRegistry.getItemsForCategory(this.activeCategory).map(entity => new CatalogEntityItem(entity));
  }

  watch() {
    const disposers: IReactionDisposer[] = [
      reaction(() => this.entities, () => this.loadAll()),
      reaction(() => this.activeCategory, () => this.loadAll(), { delay: 100})
    ];

    return () => disposers.forEach((dispose) => dispose());
  }

  loadAll() {
    return this.loadItems(() => this.entities);
  }
}
