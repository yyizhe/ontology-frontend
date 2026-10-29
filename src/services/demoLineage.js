const createdAt = "2026-10-19T02:00:00.000Z";
const base = { projectId: "global", connectionConfigId: "connection-demo", directoryId: "dir-demo-business", directory: "业务数据", status: "ready", dataShape: "structured", assetLevel: "platform", storageType: "object_storage", storageService: "MinIO（Mock）", createdAt };
const ordersId = "file-demo-lineage-orders";
const customersId = "file-demo-lineage-customers";
const wideId = "file-demo-lineage-order-wide";
const orders = { assetFileId: ordersId, dataset: "ods.order_header" };
const customers = { assetFileId: customersId, dataset: "master_data.customer_profile" };

export const demoTableLineage = [
  { scope: "data_object", source: orders, relation: "投影生成", expression: "SELECT order_id, customer_id, order_amount FROM ods.order_header" },
  { scope: "data_object", source: customers, relation: "关联补充", expression: "JOIN master_data.customer_profile c ON o.customer_id = c.customer_id" },
  { scope: "metadata", source: { ...orders, field: "order_id", type: "varchar(32)" }, targetField: "order_id", relation: "直接映射", expression: "o.order_id" },
  { scope: "metadata", source: { ...orders, field: "customer_id", type: "varchar(32)" }, targetField: "customer_id", relation: "直接映射", expression: "o.customer_id" },
  { scope: "metadata", source: { ...customers, field: "customer_name", type: "varchar(128)" }, targetField: "customer_name", relation: "关联取值", expression: "c.customer_name WHERE o.customer_id = c.customer_id" },
  { scope: "metadata", source: { ...orders, field: "order_amount", type: "decimal(18,2)" }, targetField: "amount", relation: "字段重命名", expression: "o.order_amount AS amount" },
];

const tableFile = (id, dataset, name, schema, sample) => {
  const fileName = `${dataset.split(".").pop()}.json`;
  return { ...base, id, name, fileName, objectKey: `lineage-demo/${fileName}`, filePath: `/extracted/lineage-demo/${fileName}`, sizeBytes: 24576, content: { dataset, rows: 3956, schema: schema.map(([name, type]) => ({ name, type, nullable: false })), sample: [sample] } };
};
export const demoLineageFiles = [
  tableFile(ordersId, orders.dataset, "订单原始表", [["order_id", "varchar(32)"], ["customer_id", "varchar(32)"], ["order_amount", "decimal(18,2)"]], { order_id: "SO202609010001", customer_id: "C00001", order_amount: 12800.5 }),
  tableFile(customersId, customers.dataset, "客户主数据来源表", [["customer_id", "varchar(32)"], ["customer_name", "varchar(128)"]], { customer_id: "C00001", customer_name: "华东科技有限公司" }),
  tableFile(wideId, "dwd.order_wide", "订单宽表（跨表血缘示例）", [["order_id", "varchar(32)"], ["customer_id", "varchar(32)"], ["customer_name", "varchar(128)"], ["amount", "decimal(18,2)"]], { order_id: "SO202609010001", customer_id: "C00001", customer_name: "华东科技有限公司", amount: 12800.5 }),
];
demoLineageFiles[2].content.lineage = demoTableLineage;

export const demoLineageJob = { id: "task-demo-lineage-order-wide", projectId: "global", name: "订单宽表血缘孵化", type: "metadata_enrichment", status: "succeeded", assetFileId: wideId, templateDefinitionId: "template-demo-quality", requestJson: { enrichmentType: "lineage", assetDirectoryId: base.directoryId, assetFileIds: [wideId] }, createdAt };
const child = { id: "exec-demo-lineage-order-wide-001:task:1", assetFileId: wideId, fileName: demoLineageFiles[2].fileName, fileSnapshot: demoLineageFiles[2], dataShape: "structured", enrichmentType: "lineage", status: "succeeded", startedTime: Date.parse(createdAt), finishedTime: Date.parse("2026-10-19T02:01:00.000Z"), resultJson: { demo: true, templateId: "template-demo-quality", fields: [], lineage: demoTableLineage } };
export const demoLineageRecord = { id: "exec-demo-lineage-order-wide-001", projectId: "global", taskId: demoLineageJob.id, jobName: demoLineageJob.name, name: "订单宽表血缘孵化 #1", executionNo: 1, assetFileId: wideId, requestJson: demoLineageJob.requestJson, status: "succeeded", startedTime: child.startedTime, finishedTime: child.finishedTime, createdAt, successCount: 1, errorCount: 0, fieldCount: 0, resultJson: { demo: true, enrichmentType: "lineage", templateId: "template-demo-quality", tasks: [child], summary: "已生成 2 条数据对象血缘与 4 条元数据字段血缘" } };
