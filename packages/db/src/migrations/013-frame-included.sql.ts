// Per-frame include flag: which extracted/captured frames feed document generation. Default
// 1 (included) so existing + newly extracted frames are on by default; the user deselects
// noise. Also lets a re-extract preserve manual captures (kind='manual') — see
// deleteAutoFramesByMediaId.
export const migration013 = `
ALTER TABLE frame ADD COLUMN included INTEGER NOT NULL DEFAULT 1;
`;
