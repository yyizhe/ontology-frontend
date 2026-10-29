const ACCOUNT_KEY = "datapilot.accountContext";
const WORKSPACE_KEY = "datapilot.workspaceContext";
const DEMO_ACCOUNT = {
  id: "demo-user",
  name: "演示账号",
  platformName: "数据平台",
  organizations: [
    { id: "organization-demo", name: "示例单位" },
    { id: "organization-collaboration", name: "协作单位" },
  ],
};

export function readAccountContext() {
  try {
    const stored = JSON.parse(localStorage.getItem(ACCOUNT_KEY));
    if (stored?.id && Array.isArray(stored.organizations)) return stored;
  } catch {}
  return DEMO_ACCOUNT;
}

export function projectOrganizationId(project, account) {
  return project?.organizationId || account.organizations[0]?.id || "";
}

export function readWorkspace(account) {
  try {
    const stored = JSON.parse(localStorage.getItem(WORKSPACE_KEY));
    if (stored?.accountId === account.id && account.organizations.some((item) => item.id === stored.organizationId)) return stored;
  } catch {}
  return { accountId: account.id, organizationId: account.organizations[0]?.id || "", projects: {} };
}

export function saveWorkspace(account, organizationId, projectId) {
  const current = readWorkspace(account);
  localStorage.setItem(WORKSPACE_KEY, JSON.stringify({ ...current, accountId: account.id, organizationId, projects: { ...current.projects, [organizationId]: projectId } }));
}
