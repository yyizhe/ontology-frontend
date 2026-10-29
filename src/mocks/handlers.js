import { http, HttpResponse } from "msw";
import { mockStore, ROOT_DIRECTORY, getCurrentProjectId, getProjects, createProject, updateProject, deleteProjectCascade, setCurrentProjectId } from "./store";
import { saveElement, removeElement, cloneNamespace, restoreElementSnapshot } from "../services/spgModel";
import { applyComparisonToModel } from "../services/spgWorkflow";

const json = (data, status = 200) => HttpResponse.json(data, { status });
const notFound = () => json({ message: "资源不存在" }, 404);
const body = async (request) => {
  try {
    return await request.json();
  } catch {
    return {};
  }
};
const projectIdFromUrl = (request) => {
  const url = new URL(request.url);
  if (url.searchParams.get("scope") === "global") return undefined;
  return url.searchParams.get("projectId") || getCurrentProjectId();
};
const rowsForType = (type, projectId) => mockStore.list("tasks", { projectId }).filter((item) => item.type === type);
const assetValue = (value, projectId) => {
  const source = mockStore.list("sources", { projectId }).find((item) => item.id === value.connectionConfigId);
  return {
    ...value,
    projectId,
    directoryId: value.directoryId || "all",
    directory: value.directory || "全部资产",
    storageType: "object_storage",
    storageService: value.storageService || "MinIO（Mock）",
    objectKey: value.objectKey || value.filePath || `mock/${value.fileName || value.name}`,
  };
};
const connectionDataScope = (source) => {
  if (source?.type === "object_storage" || String(source?.type || "").startsWith("object_storage_")) {
    return {
      kind: "object_storage",
      buckets: [
        { name: "data-lake", prefixes: [{ value: "raw/customer/", objects: ["raw/customer/2026/09/customer-001.json", "raw/customer/2026/09/customer-002.json", "raw/customer/2026/09/customer-003.json"] }, { value: "raw/order/", objects: ["raw/order/2026/09/order-001.json", "raw/order/2026/09/order-002.json"] }] },
        { name: "archive-zone", prefixes: [{ value: "daily/", objects: ["daily/2026-09-01/customers.parquet", "daily/2026-09-01/orders.parquet"] }] },
      ],
    };
  }
  if (source?.type === "api" || String(source?.type || "").startsWith("third_party_api")) return { kind: "api" };
  return {
    kind: "database",
    databases: [
      { name: "master_data", schemas: [{ name: "public", tables: ["customer_profile", "customer_contact", "customer_tag"] }, { name: "reference", tables: ["region_dictionary", "industry_dictionary"] }] },
      { name: "sales", schemas: [{ name: "public", tables: ["order_transaction", "order_line", "payment_record"] }, { name: "analytics", tables: ["daily_sales_summary", "customer_order_metrics"] }] },
    ],
  };
};

function taskHandlers(path, type) {
  return [
    http.get(path, ({ request }) => {
      const projectId = projectIdFromUrl(request);
      return json(rowsForType(type, projectId));
    }),
    http.post(path, async ({ request }) => json(mockStore.create("tasks", { ...(await body(request)), type }, "task"), 201)),
    http.put(`${path}/:id`, async ({ params, request }) => {
      const projectId = projectIdFromUrl(request);
      const row = mockStore.update("tasks", params.id, { ...(await body(request)), type }, { projectId });
      return row ? json(row) : notFound();
    }),
    http.delete(`${path}/:id`, ({ params, request }) => {
      const projectId = projectIdFromUrl(request);
      const row = mockStore.find("tasks", params.id, { projectId });
      if (!row) return notFound();
      mockStore.remove("tasks", params.id, { projectId });
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}

const handlers = [
  // ===== 项目(Project)管理 =====
  http.get("/api/projects", () => json(getProjects())),
  http.get("/api/projects/current", () => json({ id: getCurrentProjectId() })),
  http.post("/api/projects/current", async ({ request }) => {
    const value = await body(request);
    if (!value.id) return json({ message: "缺少项目 id" }, 400);
    const exists = getProjects().some((project) => project.id === value.id);
    if (!exists) return json({ message: "项目不存在" }, 404);
    setCurrentProjectId(value.id);
    return json({ id: value.id });
  }),
  http.post("/api/projects", async ({ request }) => {
    const value = await body(request);
    try {
      return json(createProject(value), 201);
    } catch (error) {
      return json({ message: error.message || "创建失败" }, 400);
    }
  }),
  http.put("/api/projects/:id", async ({ params, request }) => {
    const value = await body(request);
    const row = updateProject(params.id, value);
    return row ? json(row) : notFound();
  }),
  http.delete("/api/projects/:id", ({ params }) => {
    try {
      deleteProjectCascade(params.id);
      return new HttpResponse(null, { status: 204 });
    } catch (error) {
      return json({ message: error.message || "删除失败" }, 400);
    }
  }),

  // ===== 资产目录 =====
  http.get("/api/asset-directories", ({ request }) => {
    const projectId = projectIdFromUrl(request);
    const scoped = mockStore.list("directories", { projectId });
    return json([ROOT_DIRECTORY, ...scoped]);
  }),
  http.post("/api/asset-directories", async ({ request }) => {
    const value = await body(request);
    const projectId = value.projectId || getCurrentProjectId();
    return json(mockStore.create("directories", { ...value, projectId }, "dir"), 201);
  }),
  http.put("/api/asset-directories/:id", async ({ params, request }) => {
    const value = await body(request);
    const projectId = projectIdFromUrl(request) ?? value.projectId;
    const row = mockStore.update("directories", params.id, value, { projectId });
    return row ? json(row) : notFound();
  }),
  http.delete("/api/asset-directories/:id", ({ params, request }) => {
    const projectId = projectIdFromUrl(request);
    const row = mockStore.find("directories", params.id, { projectId });
    if (!row) return notFound();
    mockStore.remove("directories", params.id, { projectId });
    return new HttpResponse(null, { status: 204 });
  }),

  // ===== 数据源/连接 =====
  http.get("/api/connection-configs", ({ request }) => json(mockStore.list("sources", { projectId: projectIdFromUrl(request) }))),
  http.get("/api/connection-configs/:id/data-scope", ({ params }) => {
    const source = mockStore.find("sources", params.id);
    return source ? json(connectionDataScope(source)) : notFound();
  }),
  http.post("/api/connection-configs", async ({ request }) => {
    const value = await body(request);
    const projectId = value.projectId || getCurrentProjectId();
    return json(mockStore.create("sources", { ...value, projectId }, "connection"), 201);
  }),
  http.put("/api/connection-configs/:id", async ({ params, request }) => {
    const value = await body(request);
    const projectId = projectIdFromUrl(request) ?? value.projectId;
    const row = mockStore.update("sources", params.id, value, { projectId });
    return row ? json(row) : notFound();
  }),
  http.delete("/api/connection-configs/:id", ({ params, request }) => {
    const projectId = projectIdFromUrl(request);
    const row = mockStore.find("sources", params.id, { projectId });
    if (!row) return notFound();
    mockStore.remove("sources", params.id, { projectId });
    return new HttpResponse(null, { status: 204 });
  }),

  // ===== 任务 =====
  ...taskHandlers("/api/data-collection-tasks", "data_collection"),
  ...taskHandlers("/api/metadata-enrichment-tasks", "metadata_enrichment"),

  // ===== 执行记录 =====
  http.get("/api/task-execution-records", ({ request }) => json(mockStore.list("records", { projectId: projectIdFromUrl(request) }))),
  http.post("/api/task-execution-records", async ({ request }) => {
    const value = await body(request);
    const projectId = value.projectId || getCurrentProjectId();
    return json(mockStore.create("records", { ...value, projectId }, "exec"), 201);
  }),

  // ===== 数据资产 =====
  http.get("/api/resources/assets", ({ request }) => json(mockStore.list("assets", { projectId: projectIdFromUrl(request) }))),
  http.post("/api/resources/assets", async ({ request }) => {
    const value = await body(request);
    const projectId = value.projectId || getCurrentProjectId();
    return json(mockStore.create("assets", assetValue(value, projectId), "file"), 201);
  }),
  http.put("/api/resources/assets/:id", async ({ params, request }) => {
    const value = await body(request);
    const projectId = projectIdFromUrl(request) ?? value.projectId;
    const row = mockStore.update("assets", params.id, value, { projectId });
    return row ? json(row) : notFound();
  }),

  // ===== 元数据模板 =====
  http.get("/api/template-definitions", ({ request }) => json(mockStore.list("templates", { projectId: projectIdFromUrl(request) }))),
  http.post("/api/template-definitions", async ({ request }) => {
    const value = await body(request);
    const projectId = value.projectId || getCurrentProjectId();
    const template = mockStore.create("templates", { ...value, projectId }, "template");
    if (Array.isArray(value.definitions)) {
      value.definitions.forEach((definition) => mockStore.create("definitions", { ...definition, projectId, templateId: template.id }, "metadata"));
    }
    return json(template, 201);
  }),
  http.put("/api/template-definitions/:id", async ({ params, request }) => {
    const value = await body(request);
    const projectId = projectIdFromUrl(request) ?? value.projectId;
    const template = mockStore.update("templates", params.id, { ...value, projectId }, { projectId });
    if (!template) return notFound();
    if (Array.isArray(value.definitions)) {
      mockStore.list("definitions", { projectId }).filter((item) => item.templateId === params.id).forEach((item) => mockStore.remove("definitions", item.id));
      value.definitions.forEach((definition) => mockStore.create("definitions", { ...definition, projectId, templateId: params.id }, "metadata"));
    }
    return json(template);
  }),
  http.delete("/api/template-definitions/:id", ({ params, request }) => {
    const projectId = projectIdFromUrl(request);
    const row = mockStore.find("templates", params.id, { projectId });
    if (!row) return notFound();
    mockStore.remove("templates", params.id, { projectId });
    mockStore.list("definitions", { projectId }).filter((item) => item.templateId === params.id).forEach((item) => mockStore.remove("definitions", item.id, { projectId }));
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/metadata-definitions", ({ request }) => json(mockStore.list("definitions", { projectId: projectIdFromUrl(request) }))),

  // ===== 第三方应用 =====
  http.get("/api/third-party-apps", ({ request }) => json(mockStore.list("thirdPartyApps", { projectId: projectIdFromUrl(request) }))),
  http.post("/api/third-party-apps", async ({ request }) => {
    const value = await body(request);
    const projectId = value.projectId || getCurrentProjectId();
    const random = () => Math.random().toString(16).slice(2).padEnd(32, "0").slice(0, 32);
    return json(mockStore.create("thirdPartyApps", { ...value, projectId, appId: random(), appToken: random(), status: "enabled", lastAccessedAt: "" }, "app"), 201);
  }),
  http.put("/api/third-party-apps/:id", async ({ params, request }) => {
    const value = await body(request);
    const projectId = projectIdFromUrl(request) ?? value.projectId;
    const row = mockStore.update("thirdPartyApps", params.id, value, { projectId });
    return row ? json(row) : notFound();
  }),
  http.delete("/api/third-party-apps/:id", ({ params, request }) => {
    const projectId = projectIdFromUrl(request);
    const row = mockStore.find("thirdPartyApps", params.id, { projectId });
    if (!row) return notFound();
    mockStore.remove("thirdPartyApps", params.id, { projectId });
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/third-party-calls", ({ request }) => json(mockStore.list("thirdPartyCalls", { projectId: projectIdFromUrl(request) }))),

  // ===== SPG Schema =====
  http.get("/api/spg-schemas", ({ request }) => json(mockStore.spgSchema({ projectId: projectIdFromUrl(request) }).schemas)),
  http.post("/api/spg-schemas", async ({ request }) => {
    const value = await body(request);
    const projectId = value.projectId || getCurrentProjectId();
    const row = { ...value, id: `spg-schema-${Date.now()}`, projectId, updatedAt: new Date().toISOString() };
    mockStore.saveSpgSchemaEntity("schemas", row);
    return json(row, 201);
  }),
  http.put("/api/spg-schemas/:id", async ({ params, request }) => {
    const value = await body(request);
    const projectId = value.projectId || getCurrentProjectId();
    const row = mockStore.updateSpgSchemaEntity("schemas", params.id, { ...value, projectId });
    return row ? json(row) : notFound();
  }),
  http.delete("/api/spg-schemas/:id", ({ params, request }) => {
    const projectId = projectIdFromUrl(request);
    const model = mockStore.spgSchema({ projectId });
    if (!model.schemas.some((item) => item.id === params.id)) return notFound();
    mockStore.deleteSpgSchemaEntity("schemas", params.id);
    const all = mockStore.spgSchema();
    mockStore.saveSpgSchemaModel({
      ...all,
      concepts: all.concepts.filter((item) => item.schemaId !== params.id),
      properties: all.properties.filter((item) => item.schemaId !== params.id),
      relations: all.relations.filter((item) => item.schemaId !== params.id),
    });
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/spg-core-model", ({ request }) => json(mockStore.spgSchema({ projectId: projectIdFromUrl(request) }))),
  http.post("/api/spg-core-model/:kind", async ({ params, request }) => {
    const value = await body(request);
    const projectId = value.projectId || getCurrentProjectId();
    try {
      const { model, row } = saveElement(mockStore.spgSchema(), params.kind, { ...value, id: undefined, projectId });
      mockStore.saveSpgSchemaModel(model);
      return json(row, 201);
    } catch (error) { return json({ message: error.message }, 400); }
  }),
  http.put("/api/spg-core-model/:kind/:id/restore", async ({ params, request }) => {
    const value = await body(request);
    const projectId = value.projectId || getCurrentProjectId();
    try {
      const restored = restoreElementSnapshot(mockStore.spgSchema(), params.kind, { ...value, id: params.id }, projectId);
      mockStore.saveSpgSchemaModel(restored);
      return json(restored[params.kind].find((item) => item.id === params.id));
    } catch (error) { return json({ message: error.message }, 400); }
  }),
  http.put("/api/spg-core-model/:kind/:id", async ({ params, request }) => {
    const value = await body(request);
    const projectId = value.projectId || getCurrentProjectId();
    try {
      const { model, row } = saveElement(mockStore.spgSchema(), params.kind, { ...value, id: params.id, projectId });
      mockStore.saveSpgSchemaModel(model);
      return json(row);
    } catch (error) { return json({ message: error.message }, 400); }
  }),
  http.delete("/api/spg-core-model/:kind/:id", ({ params, request }) => {
    const projectId = projectIdFromUrl(request);
    try {
      mockStore.saveSpgSchemaModel(removeElement(mockStore.spgSchema(), params.kind, params.id, projectId));
      return new HttpResponse(null, { status: 204 });
    } catch (error) { return json({ message: error.message }, 400); }
  }),
  http.post("/api/spg-namespace-drafts/:id", ({ params, request }) => {
    try {
      const result = cloneNamespace(mockStore.spgSchema(), params.id, projectIdFromUrl(request));
      mockStore.saveSpgSchemaModel(result.model);
      return json({ namespaceId: result.namespaceId, versionId: result.versionId }, 201);
    } catch (error) { return json({ message: error.message }, 400); }
  }),
  http.post("/api/spg-comparisons/apply", async ({ request }) => {
    try {
      const comparison = await body(request);
      mockStore.saveSpgSchemaModel(applyComparisonToModel(mockStore.spgSchema(), comparison, projectIdFromUrl(request)));
      return json({ applied: true });
    } catch (error) { return json({ message: error.message }, 400); }
  }),
];

["concepts", "properties", "relations"].forEach((kind) => {
  handlers.push(
    http.get(`/api/spg-schemas/:schemaId/${kind}`, ({ params, request }) => {
      const projectId = projectIdFromUrl(request);
      const model = mockStore.spgSchema({ projectId });
      return json(model[kind].filter((item) => item.schemaId === params.schemaId));
    }),
    http.post(`/api/spg-schemas/:schemaId/${kind}`, async ({ params, request }) => {
      const value = await body(request);
      const projectId = value.projectId || getCurrentProjectId();
      if (kind !== "concepts") {
        try {
          const all = mockStore.spgSchema();
          const namespace = all.namespaces.find((item) => item.id === params.schemaId && item.projectId === projectId);
          const result = saveElement(all, kind, { ...value, id: undefined, namespaceId: params.schemaId, versionId: namespace?.versionId, projectId });
          mockStore.saveSpgSchemaModel(result.model);
          return json(result.row, 201);
        } catch (error) { return json({ message: error.message }, 400); }
      }
      const row = { ...value, id: `spg-${kind.slice(0, -1)}-${Date.now()}`, schemaId: params.schemaId, projectId, updatedAt: new Date().toISOString() };
      mockStore.saveSpgSchemaEntity(kind, row);
      return json(row, 201);
    }),
    http.put(`/api/spg-schemas/:schemaId/${kind}/:id`, async ({ params, request }) => {
      const value = await body(request);
      const projectId = value.projectId || getCurrentProjectId();
      if (kind !== "concepts") {
        try {
          const all = mockStore.spgSchema();
          if (!all[kind]?.some((item) => item.id === params.id && item.namespaceId === params.schemaId && item.projectId === projectId)) return notFound();
          const result = saveElement(all, kind, { ...value, id: params.id, projectId });
          mockStore.saveSpgSchemaModel(result.model);
          return json(result.row);
        } catch (error) { return json({ message: error.message }, 400); }
      }
      const row = mockStore.updateSpgSchemaEntity(kind, params.id, { ...value, schemaId: params.schemaId, projectId });
      return row ? json(row) : notFound();
    }),
    http.delete(`/api/spg-schemas/:schemaId/${kind}/:id`, ({ params, request }) => {
      const projectId = projectIdFromUrl(request);
      const model = mockStore.spgSchema({ projectId });
      if (kind !== "concepts") {
        try {
          if (!model[kind]?.some((item) => item.id === params.id && item.namespaceId === params.schemaId)) return notFound();
          mockStore.saveSpgSchemaModel(removeElement(mockStore.spgSchema(), kind, params.id, projectId));
          return new HttpResponse(null, { status: 204 });
        } catch (error) { return json({ message: error.message }, 400); }
      }
      if (!model[kind].some((item) => item.id === params.id && item.schemaId === params.schemaId)) return notFound();
      mockStore.deleteSpgSchemaEntity(kind, params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

export { handlers };
