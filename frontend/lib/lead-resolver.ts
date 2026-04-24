import { db } from "@/db";
import { LEADS, USER } from "@/db/collections";
import type { LeadDoc } from "@/db/collections";
import { generateRandomUUID } from "@/helpers/generate-random-uuid";

export interface ResolveLeadInput {
  whatsappPhone?: string;
  instagramUserId?: string;
  instagramUsername?: string;
  source: "whatsapp" | "instagram";
}

/** Returns the sales user id with the fewest assigned leads, or null if no sales users. */
async function getLeastLoadedSalesUserId(): Promise<string | null> {
  const userCol = db.collection<{ id: string; role: string; banned?: boolean }>(
    USER,
  );
  const salesUsers = await userCol
    .find({
      role: "sales",
      $or: [{ banned: { $ne: true } }, { banned: { $exists: false } }],
    })
    .project({ id: 1 })
    .toArray();
  const salesIds = salesUsers.map((u) => u.id).filter(Boolean);
  if (salesIds.length === 0) return null;

  const leadCol = db.collection<LeadDoc>(LEADS);
  const counts = await leadCol
    .aggregate<{
      _id: string;
      count: number;
    }>([{ $match: { assignedUserId: { $in: salesIds } } }, { $group: { _id: "$assignedUserId", count: { $sum: 1 } } }])
    .toArray();

  const countByUserId = new Map<string, number>(
    counts.map((c) => [c._id, c.count]),
  );
  let minId: string | null = null;
  let minCount = Infinity;
  for (const id of salesIds) {
    const count = countByUserId.get(id) ?? 0;
    if (count < minCount) {
      minCount = count;
      minId = id;
    }
  }
  return minId;
}

export async function resolveLeadFromInboundMessage(
  input: ResolveLeadInput,
): Promise<LeadDoc> {
  const { whatsappPhone, instagramUserId, instagramUsername } = input;
  const col = db.collection<LeadDoc>(LEADS);

  if (whatsappPhone) {
    const found = await col.findOne({
      $or: [{ whatsappPhone }, { phone: whatsappPhone }],
    });
    if (found) {
      if (!found.whatsappPhone) {
        await col.updateOne(
          { id: found.id },
          { $set: { whatsappPhone, updatedAt: new Date() } },
        );
      }
      return found;
    }
    const assignedUserId = await getLeastLoadedSalesUserId();
    const created: LeadDoc = {
      id: generateRandomUUID(),
      name: "Unknown",
      phone: whatsappPhone,
      source: "whatsapp",
      stage: "new",
      assignedUserId: assignedUserId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      slaStatus: "pending",
      whatsappPhone,
    };
    await col.insertOne(created);
    return created;
  }

  if (instagramUserId) {
    const found = await col.findOne({ instagramUserId });
    if (found) {
      if (
        instagramUsername &&
        (found.instagramUsername !== instagramUsername ||
          !found.instagramUsername)
      ) {
        await col.updateOne(
          { id: found.id },
          {
            $set: {
              instagramUsername,
              updatedAt: new Date(),
            },
          },
        );
      }
      return found;
    }
    const assignedUserId = await getLeastLoadedSalesUserId();
    const phonePlaceholder = `ig-${instagramUserId}`;
    const created: LeadDoc = {
      id: generateRandomUUID(),
      name: instagramUsername ?? "Unknown",
      phone: phonePlaceholder,
      source: "instagram",
      stage: "new",
      assignedUserId: assignedUserId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      slaStatus: "pending",
      instagramUserId,
      instagramUsername: instagramUsername ?? null,
    };
    await col.insertOne(created);
    return created;
  }

  throw new Error("Either whatsappPhone or instagramUserId is required");
}
