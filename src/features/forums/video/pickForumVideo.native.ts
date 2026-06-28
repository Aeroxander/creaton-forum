import * as DocumentPicker from "expo-document-picker";

import { validateForumVideoByteSize } from "./forumVideoLimits";

export async function pickForumVideo() {
  const result = await DocumentPicker.getDocumentAsync({
    type: "video/*",
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.[0]) {
    return null;
  }

  const asset = result.assets[0];
  validateForumVideoByteSize(asset.size);
  return asset;
}
