/**
 * "Owner mode" — chu du an duoc hoi nhung thu NOI BO ma nguoi khac bi tu choi:
 * tien do that, viec con no, deadline du kien, so lieu, chi phi, thong tin kinh doanh.
 *
 * KHONG bao gom secret: gia tri .env / API key / token / connection string van bi
 * tu choi voi MOI NGUOI, ke ca owner. Ly do: tin nhan Discord nam tren server Discord
 * (khong ma hoa dau-cuoi) va ton tai mai; chu du an ngoi ngay tren may co the doc
 * truc tiep, khong can di qua kenh nay.
 *
 * Tach ra file rieng de: (1) test duoc, (2) chi co MOT cho quyet dinh viec mo khoa.
 */

export const OwnerMode = {
  /** Nguoi hoi binh thuong */
  NONE: 'none',
  /** Owner, dang nhan tin rieng */
  OWNER_DM: 'owner_dm',
  /** Owner, dang o channel server (nguoi khac doc duoc cau tra loi) */
  OWNER_CHANNEL: 'owner_channel',
};

/**
 * @param {object} a
 * @param {string} a.authorId
 * @param {boolean} a.isDm
 * @param {string[]} a.ownerUserIds
 * @param {boolean} [a.internalInChannels] - false = chi noi thong tin noi bo trong DM
 * @returns {'none'|'owner_dm'|'owner_channel'}
 */
export function resolveOwnerMode({ authorId, isDm, ownerUserIds, internalInChannels = true }) {
  if (!authorId || !Array.isArray(ownerUserIds) || !ownerUserIds.includes(authorId)) return OwnerMode.NONE;
  if (isDm) return OwnerMode.OWNER_DM;
  return internalInChannels ? OwnerMode.OWNER_CHANNEL : OwnerMode.NONE;
}

/** Co append system prompt owner hay khong */
export function isOwnerUnlocked(mode) {
  return mode === OwnerMode.OWNER_DM || mode === OwnerMode.OWNER_CHANNEL;
}

/**
 * Owner co duoc DM bot khong (ke ca khi ALLOW_DM=false cho nguoi thuong).
 */
export function ownerCanDm(authorId, ownerUserIds) {
  return Array.isArray(ownerUserIds) && ownerUserIds.includes(authorId);
}
