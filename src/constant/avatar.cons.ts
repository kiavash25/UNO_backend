export const AVATAR_OPTIONS = [
  "/assets/avatars/avatar_1.png",
  "/assets/avatars/avatar_2.png",
  "/assets/avatars/avatar_3.png",
  "/assets/avatars/avatar_4.png",
  "/assets/avatars/avatar_5.png",
  "/assets/avatars/avatar_6.png",
  "/assets/avatars/avatar_7.png",
  "/assets/avatars/avatar_8.png",
  "/assets/avatars/avf1.png",
  "/assets/avatars/avf2.png",
  "/assets/avatars/avf3.png",
  "/assets/avatars/avf4.png",
  "/assets/avatars/avm1.png",
  "/assets/avatars/avm2.png",
  "/assets/avatars/avm3.png",
  "/assets/avatars/avm4.png",
  "/assets/avatars/avm5.png",
  "/assets/avatars/avm6.png",
  "/assets/avatars/avm7.png",
] as const;

export const LEGACY_AVATAR_OPTIONS = AVATAR_OPTIONS.map((avatar) =>
  avatar.replace("/assets/avatars/", "/img/avatars/"),
);

export function normalizeAvatar(avatar: string): string {
  return avatar.replace("/img/avatars/", "/assets/avatars/");
}
