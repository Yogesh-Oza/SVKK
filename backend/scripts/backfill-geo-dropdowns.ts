import { prisma } from "../src/lib/prisma.js";
import { backfillGeoDropdownsFromRecords } from "../src/modules/dropdowns/ensure-dropdown-options.js";

async function main() {
  await backfillGeoDropdownsFromRecords();
  const [villages, areas, cities] = await Promise.all([
    prisma.dropdownOption.count({ where: { type: "VILLAGE", isActive: true } }),
    prisma.dropdownOption.count({ where: { type: "AREA", isActive: true } }),
    prisma.dropdownOption.count({ where: { type: "CITY", isActive: true } }),
  ]);
  console.log(`Active dropdowns — Village: ${villages}, Area: ${areas}, City: ${cities}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
