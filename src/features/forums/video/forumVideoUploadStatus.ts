import type { ForumVideoUploadProgress } from "./uploadForumVideo";

export function formatForumVideoUploadStatus(progress: ForumVideoUploadProgress): string {
  if (progress.phase === "packaging") {
    return `Processing video… ${Math.round(progress.progress * 100)}%`;
  }
  if (progress.phase === "uploading-segments") {
    return `Uploading segments… ${progress.completed}/${progress.total}`;
  }
  if (progress.phase === "uploading-playlists") {
    return `Uploading playlists… ${progress.completed}/${progress.total}`;
  }
  if (progress.phase === "done") {
    return "Finishing…";
  }
  return "Uploading video…";
}
