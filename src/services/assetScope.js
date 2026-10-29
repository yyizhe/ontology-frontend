export const ASSET_LEVELS = { platform: "平台级", organization: "单位级", project: "项目级" };

export function assetLevelOf(file) {
  return ASSET_LEVELS[file?.assetLevel] ? file.assetLevel : "platform";
}
