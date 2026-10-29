export const NATIVE_FIELD_MODES = { all: "全部保留", selected: "部分纳入", none: "完全不纳入" };

export function normalizeNativeFieldPolicy(policy) {
  return {
    mode: Object.hasOwn(NATIVE_FIELD_MODES, policy?.mode) ? policy.mode : "all",
    fields: [...new Set((policy?.fields || []).filter((code) => typeof code === "string"))],
    sourceFileId: policy?.sourceFileId || "",
    sourceFields: Array.isArray(policy?.sourceFields) ? policy.sourceFields : [],
  };
}

export function includesNativeField(policy, code) {
  const rule = normalizeNativeFieldPolicy(policy);
  return rule.mode === "all" || (rule.mode === "selected" && rule.fields.includes(code));
}

export function nativeFieldPolicyLabel(policy) {
  const rule = normalizeNativeFieldPolicy(policy);
  return `${NATIVE_FIELD_MODES[rule.mode]}${rule.mode === "selected" ? `（${rule.fields.length} 项）` : ""}`;
}
