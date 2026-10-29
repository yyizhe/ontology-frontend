# 数据资产与元数据数据库设计

## 1. 设计范围

本文将页面中的七类业务对象映射为数据库表，并约定它们之间的关系：

| 页面对象 | 核心表 | 说明 |
| --- | --- | --- |
| 资产目录 | `asset_directory` | 支持无限层级的目录树，使用邻接表模型保存父子关系 |
| 数据源 | `data_source` | 数据库、文件、接口、对象存储等可被提取的数据入口 |
| 连接配置 | `source_connection_config` | 数据源的连接参数，与数据源一对一；敏感字段应加密或引用密钥 |
| 数据 | `data_asset` | 数据源下可提取的具体对象，如表、文件、接口资源、对象路径 |
| 元数据模版定义 | `metadata_template` | 模版的基本信息、版本和生命周期 |
| 元数据 | `metadata_field`、`metadata_value` | `metadata_field` 声明字段名称和类型，`metadata_value` 保存一次提取后的字段值 |
| 元数据提取记录 | `metadata_extraction_record` | 每次提取的任务、状态、时间、模版和结果摘要 |

`metadata_field` 和 `metadata_value` 是“元数据”页面对应的两个物理表：前者是可复用的字段定义，后者是绑定到数据对象的实际值。这样既能支持自定义属性，也能按字段、类型和历史版本查询。

## 2. 通用约定

- 建议使用 PostgreSQL；`jsonb`、`timestamptz` 可替换为目标数据库的 JSON 和带时区时间类型。
- 所有主键使用 `uuid`，由应用或数据库生成；示例省略具体生成函数。
- `created_at`、`updated_at` 为必填审计字段；删除采用 `deleted_at` 软删除，便于追溯提取历史。
- 状态字段使用小写英文枚举值，前端负责显示中文文案。
- 密码、Token、私钥等禁止明文入库，`source_connection_config` 只保存密文或密钥管理系统引用。
- 所有外键均应建立索引；删除策略默认 `RESTRICT`，避免误删历史记录。

## 3. 表结构

### 3.1 资产目录 `asset_directory`

保存多级目录树。根目录的 `parent_id` 为 `NULL`，系统根节点可通过 `is_system = true` 标记并禁止删除。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | uuid | 是 |  | 主键 |
| `parent_id` | uuid | 否 | `NULL` | 父目录，外键指向本表 `id` |
| `name` | varchar(128) | 是 |  | 目录名称 |
| `path` | varchar(2048) | 是 |  | 规范化路径，如 `/经营分析/销售`，用于检索和展示 |
| `level` | integer | 是 | `0` | 层级深度，根目录为 0 |
| `sort_order` | integer | 是 | `0` | 同级目录排序 |
| `is_system` | boolean | 是 | `false` | 是否为系统目录 |
| `created_by` | uuid | 否 |  | 创建人 |
| `created_at` | timestamptz | 是 | `now()` | 创建时间 |
| `updated_at` | timestamptz | 是 | `now()` | 更新时间 |
| `deleted_at` | timestamptz | 否 | `NULL` | 软删除时间 |

约束与索引：

- `UNIQUE(parent_id, name)`，保证同一父目录下不允许同名目录。
- `INDEX(parent_id)`、`INDEX(path)`；软删除场景下唯一约束应使用 `WHERE deleted_at IS NULL` 的部分索引。
- 应用层或触发器必须阻止把目录移动到自身或其子孙节点下。

### 3.2 数据源 `data_source`

一个数据源代表一个可复用的连接入口，可被多个数据对象和多个提取记录引用。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | uuid | 是 |  | 主键 |
| `directory_id` | uuid | 否 | `NULL` | 所属资产目录，外键指向 `asset_directory.id` |
| `name` | varchar(128) | 是 |  | 数据源名称 |
| `source_type` | varchar(32) | 是 |  | `postgresql`、`mysql`、`excel`、`csv`、`json`、`sftp`、`rest_api`、`minio` 等 |
| `description` | varchar(500) | 否 |  | 描述 |
| `status` | varchar(20) | 是 | `'draft'` | `draft`、`ready`、`disabled`、`error` |
| `last_tested_at` | timestamptz | 否 |  | 最近一次连接测试时间 |
| `last_test_status` | varchar(20) | 否 |  | `success`、`failed` |
| `last_test_message` | varchar(1000) | 否 |  | 最近测试结果 |
| `created_by` | uuid | 否 |  | 创建人 |
| `created_at` | timestamptz | 是 | `now()` | 创建时间 |
| `updated_at` | timestamptz | 是 | `now()` | 更新时间 |
| `deleted_at` | timestamptz | 否 | `NULL` | 软删除时间 |

约束与索引：

- `UNIQUE(directory_id, name)`，保证一个目录下不能出现多个同名数据源；未分类数据源可用 `COALESCE(directory_id, '00000000-0000-0000-0000-000000000000')` 的函数索引实现同样规则。
- `INDEX(source_type)`、`INDEX(directory_id)`、`INDEX(status)`。

### 3.3 连接配置 `source_connection_config`

与 `data_source` 一对一。不同 `source_type` 的差异化参数放在 `config_json`，稳定的公共字段单独列出，便于校验和筛选。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | uuid | 是 |  | 主键 |
| `source_id` | uuid | 是 |  | 外键指向 `data_source.id`，唯一 |
| `database_type` | varchar(32) | 否 |  | `postgresql`、`mysql`、`greenplum`、`dm8` 等 |
| `host` | varchar(255) | 否 |  | 主机或 IP |
| `port` | integer | 否 |  | 端口 |
| `database_name` | varchar(128) | 否 |  | 数据库名 |
| `username` | varchar(128) | 否 |  | 用户名 |
| `secret_ref` | varchar(255) | 否 |  | 密码、Token、私钥的密钥引用 |
| `jdbc_url` | varchar(1000) | 否 |  | JDBC 或完整连接地址 |
| `file_path` | varchar(2048) | 否 |  | 本地文件、文件夹或远程路径 |
| `endpoint_url` | varchar(1000) | 否 |  | REST、S3、MinIO 等端点 |
| `ssh_enabled` | boolean | 是 | `false` | 是否启用 SSH 隧道 |
| `ssh_config_json` | jsonb | 否 |  | SSH 主机、端口、用户、认证方式、密钥引用等 |
| `config_json` | jsonb | 是 | `'{}'` | 类型专属配置，如 SSL、Schema、请求头、编码、分隔符 |
| `created_at` | timestamptz | 是 | `now()` | 创建时间 |
| `updated_at` | timestamptz | 是 | `now()` | 更新时间 |

约束与索引：`UNIQUE(source_id)`、`CHECK(port IS NULL OR port BETWEEN 1 AND 65535)`、`INDEX(database_type)`。

### 3.4 数据 `data_asset`

数据源下可提取的最小对象。数据库通常对应一张表或视图，文件对应一个文件，接口对应资源路径。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | uuid | 是 |  | 主键 |
| `source_id` | uuid | 是 |  | 外键指向 `data_source.id` |
| `name` | varchar(256) | 是 |  | 数据对象名称 |
| `object_type` | varchar(32) | 是 |  | `table`、`view`、`file`、`api_resource`、`object` |
| `object_identifier` | varchar(2048) | 是 |  | 表名、Schema+表名、文件路径或 API 资源标识 |
| `format` | varchar(32) | 否 |  | `json`、`csv`、`xlsx`、`parquet` 等 |
| `schema_json` | jsonb | 否 |  | 最近一次探查得到的字段结构 |
| `row_count` | bigint | 否 |  | 最近一次统计的记录数 |
| `size_bytes` | bigint | 否 |  | 数据大小 |
| `last_profiled_at` | timestamptz | 否 |  | 最近一次探查时间 |
| `created_at` | timestamptz | 是 | `now()` | 创建时间 |
| `updated_at` | timestamptz | 是 | `now()` | 更新时间 |
| `deleted_at` | timestamptz | 否 | `NULL` | 软删除时间 |

约束与索引：`UNIQUE(source_id, object_identifier)`、`INDEX(source_id)`、`INDEX(object_type)`。

### 3.5 元数据模版定义 `metadata_template`

声明一个可复用的元数据模版。建议通过版本号保留历史定义，已被提取记录引用的版本不允许原地修改。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | uuid | 是 |  | 主键 |
| `name` | varchar(128) | 是 |  | 模版名称 |
| `code` | varchar(64) | 是 |  | 稳定编码 |
| `version` | integer | 是 | `1` | 版本号 |
| `description` | varchar(500) | 否 |  | 模版说明 |
| `status` | varchar(20) | 是 | `'draft'` | `draft`、`published`、`archived` |
| `is_default` | boolean | 是 | `false` | 是否为默认模版 |
| `created_by` | uuid | 否 |  | 创建人 |
| `published_at` | timestamptz | 否 |  | 发布时间 |
| `created_at` | timestamptz | 是 | `now()` | 创建时间 |
| `updated_at` | timestamptz | 是 | `now()` | 更新时间 |

约束与索引：`UNIQUE(code, version)`、`INDEX(status)`；同一 `code` 同时只能有一个 `is_default = true` 的已发布版本。

### 3.6 元数据字段定义 `metadata_field`

定义模版中的扩展字段。该表是“元数据模版定义”与“元数据”页面之间的字段级连接。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | uuid | 是 |  | 主键 |
| `template_id` | uuid | 是 |  | 外键指向 `metadata_template.id` |
| `field_code` | varchar(64) | 是 |  | 稳定字段编码 |
| `field_name` | varchar(128) | 是 |  | 展示名称 |
| `data_type` | varchar(20) | 是 |  | `string`、`integer`、`decimal`、`boolean`、`date`、`datetime`、`json` |
| `is_required` | boolean | 是 | `false` | 是否必填 |
| `is_array` | boolean | 是 | `false` | 是否为数组值 |
| `default_value` | jsonb | 否 |  | 默认值 |
| `description` | varchar(500) | 否 |  | 字段说明 |
| `validation_json` | jsonb | 否 |  | 长度、正则、枚举、数值范围等校验规则 |
| `display_order` | integer | 是 | `0` | 展示顺序 |
| `created_at` | timestamptz | 是 | `now()` | 创建时间 |
| `updated_at` | timestamptz | 是 | `now()` | 更新时间 |

约束与索引：`UNIQUE(template_id, field_code)`、`INDEX(template_id, display_order)`。

### 3.7 元数据值 `metadata_value`

保存某个数据对象在某个模版字段上的当前值。历史值由提取记录下的结果表保留，当前值便于列表和详情页快速读取。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | uuid | 是 |  | 主键 |
| `data_asset_id` | uuid | 是 |  | 外键指向 `data_asset.id` |
| `template_field_id` | uuid | 是 |  | 外键指向 `metadata_field.id` |
| `value_json` | jsonb | 否 |  | 统一 JSON 表达，支持字符串、数字、数组和对象 |
| `value_text` | text | 否 |  | 可选冗余文本，便于全文检索 |
| `value_source` | varchar(20) | 是 | `'extraction'` | `extraction`、`manual`、`imported` |
| `extracted_at` | timestamptz | 否 |  | 产生该值的提取时间 |
| `extraction_record_id` | uuid | 否 |  | 来源提取记录 |
| `updated_by` | uuid | 否 |  | 最近修改人 |
| `created_at` | timestamptz | 是 | `now()` | 创建时间 |
| `updated_at` | timestamptz | 是 | `now()` | 更新时间 |

约束与索引：`UNIQUE(data_asset_id, template_field_id)`、`INDEX(template_field_id)`、`INDEX(extraction_record_id)`。

### 3.8 元数据提取记录 `metadata_extraction_record`

每次用户发起元数据提取都生成一条记录，记录数据源、数据对象、模版版本、执行时间和结果。`result_json` 保存本次提取的完整快照，便于审计和重放。

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | uuid | 是 |  | 主键 |
| `source_id` | uuid | 是 |  | 外键指向 `data_source.id` |
| `data_asset_id` | uuid | 否 |  | 外键指向 `data_asset.id`；批量任务可为空 |
| `template_id` | uuid | 是 |  | 外键指向 `metadata_template.id` |
| `template_version` | integer | 是 |  | 执行时锁定的模版版本 |
| `trigger_type` | varchar(20) | 是 | `'manual'` | `manual`、`schedule`、`api` |
| `status` | varchar(20) | 是 | `'pending'` | `pending`、`running`、`success`、`partial`、`failed`、`cancelled` |
| `started_at` | timestamptz | 否 |  | 开始时间 |
| `finished_at` | timestamptz | 否 |  | 完成时间 |
| `requested_by` | uuid | 否 |  | 发起人 |
| `field_count` | integer | 是 | `0` | 模版字段数 |
| `success_count` | integer | 是 | `0` | 成功提取字段数 |
| `error_count` | integer | 是 | `0` | 失败字段数 |
| `error_message` | text | 否 |  | 失败或警告信息 |
| `request_json` | jsonb | 否 |  | 本次运行参数、过滤条件 |
| `result_json` | jsonb | 否 |  | 完整提取结果快照 |
| `created_at` | timestamptz | 是 | `now()` | 创建时间 |

约束与索引：`INDEX(source_id, created_at DESC)`、`INDEX(template_id, created_at DESC)`、`INDEX(status)`。

### 3.9 子目录递归查询开关

当用户从资产目录发起查询或提取时，建议使用以下命名：

| 使用位置 | 名称 | 类型 | 语义 |
| --- | --- | --- | --- |
| 数据库字段 | `include_descendants` | boolean | 是否包含当前目录下的全部后代目录；`false` 仅查询当前目录 |
| 接口参数 | `includeDescendants` | boolean | 与数据库字段一一对应 |
| 前端文案 | `包含子目录` | checkbox/switch | 面向用户的中文名称 |

`include_descendants` 比 `is_recursive` 更明确：它表达的是查询范围是否包含后代节点，而不是目录结构本身是否递归。若需要把该选择完整记录到提取历史中，可将字段加入 `metadata_extraction_record`，默认值为 `false`；同时在 `request_json` 中保留本次请求的目录筛选参数。

## 4. 关系说明

1. 一个目录可以包含多个子目录和多个数据源；一个数据源最多属于一个目录。
2. 一个数据源只有一份当前连接配置，但配置可通过 `updated_at` 或独立版本表扩展审计能力。
3. 一个数据源可以发现多个数据对象；一个数据对象只属于一个数据源。
4. 一个模版包含多个元数据字段；字段编码在同一模版版本内唯一。
5. 一个数据对象可以拥有多个模版字段的当前元数据值；同一对象和字段只有一条当前值。
6. 一次提取记录绑定一个数据源和一个模版版本，可选绑定具体数据对象；提取成功后更新 `metadata_value`，同时保留 `result_json` 快照。
7. 移动数据源到其他目录只更新 `data_source.directory_id`；移动目录只更新 `asset_directory.parent_id`，不改变数据源和历史提取记录的 ID。

## 5. ER 图

```mermaid
erDiagram
    ASSET_DIRECTORY ||--o{ ASSET_DIRECTORY : contains
    ASSET_DIRECTORY ||--o{ DATA_SOURCE : organizes
    DATA_SOURCE ||--|| SOURCE_CONNECTION_CONFIG : configures
    DATA_SOURCE ||--o{ DATA_ASSET : exposes
    METADATA_TEMPLATE ||--o{ METADATA_FIELD : defines
    DATA_ASSET ||--o{ METADATA_VALUE : has
    METADATA_FIELD ||--o{ METADATA_VALUE : describes
    DATA_SOURCE ||--o{ METADATA_EXTRACTION_RECORD : extracts
    DATA_ASSET o|--o{ METADATA_EXTRACTION_RECORD : targets
    METADATA_TEMPLATE ||--o{ METADATA_EXTRACTION_RECORD : uses
    METADATA_EXTRACTION_RECORD ||--o{ METADATA_VALUE : produces

    ASSET_DIRECTORY {
        uuid id PK
        uuid parent_id FK
        varchar name
        varchar path
        int level
        boolean is_system
    }
    DATA_SOURCE {
        uuid id PK
        uuid directory_id FK
        varchar name
        varchar source_type
        varchar status
    }
    SOURCE_CONNECTION_CONFIG {
        uuid id PK
        uuid source_id FK UK
        varchar host
        int port
        jsonb config_json
        boolean ssh_enabled
    }
    DATA_ASSET {
        uuid id PK
        uuid source_id FK
        varchar name
        varchar object_type
        varchar object_identifier
        jsonb schema_json
    }
    METADATA_TEMPLATE {
        uuid id PK
        varchar code
        int version
        varchar status
    }
    METADATA_FIELD {
        uuid id PK
        uuid template_id FK
        varchar field_code
        varchar field_name
        varchar data_type
        boolean is_required
    }
    METADATA_VALUE {
        uuid id PK
        uuid data_asset_id FK
        uuid template_field_id FK
        uuid extraction_record_id FK
        jsonb value_json
    }
    METADATA_EXTRACTION_RECORD {
        uuid id PK
        uuid source_id FK
        uuid data_asset_id FK
        uuid template_id FK
        int template_version
        varchar status
        timestamptz started_at
        timestamptz finished_at
        jsonb result_json
    }
```

## 6. 一次提取的写入顺序

1. 创建 `metadata_extraction_record`，状态设为 `pending`，保存数据源、数据对象和模版版本。
2. 连接 `source_connection_config`，读取或探查 `data_asset`。
3. 按 `metadata_field` 定义提取字段，实时更新记录的计数和状态。
4. 事务内写入或更新 `metadata_value`，同时把本次完整结果写入 `result_json`。
5. 将提取记录更新为 `success`、`partial` 或 `failed`，写入 `started_at`、`finished_at` 和错误信息。

建议对第 4 步使用幂等键（例如 `extraction_record_id + template_field_id + data_asset_id`），避免任务重试产生重复值。

## 7. 后续可选扩展

- `source_connection_config_history`：保存连接配置变更历史，敏感字段仍只存密钥引用。
- `metadata_extraction_item`：当一次记录需要批量处理多个数据对象时，用明细表替代 `data_asset_id` 单值字段。
- `data_asset_snapshot`：保存每次数据探查的 schema、行数和大小快照。
- `directory_permission`、`source_permission`：需要多租户或细粒度权限时增加资源授权表。
