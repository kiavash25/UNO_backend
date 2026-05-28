export const AVATAR_OPTIONS = [
  "/assets/avatars/avm11.png",
  "/assets/avatars/avm12.png",
  "/assets/avatars/avm13.png",
  "/assets/avatars/avm14.png",
  "/assets/avatars/avm15.png",
  "/assets/avatars/avf11.png",
  "/assets/avatars/avf12.png",
  "/assets/avatars/avf13.png",
] as const;

export const LEGACY_AVATAR_OPTIONS = AVATAR_OPTIONS.map((avatar) =>
  avatar.replace("/assets/avatars/", "/img/avatars/"),
);

export function normalizeAvatar(avatar: string): string {
  return avatar.replace("/img/avatars/", "/assets/avatars/");
}
