import { spawnUpdaterAndExit } from "@/lib/appUpdater";
import { UPDATER_CONFIG } from "@/shared/constants/config";

// 1-klik auto-install: spawn detached updater lalu matikan server
export async function POST() {
  try {
    spawnUpdaterAndExit(UPDATER_CONFIG.npmPackageName);
    return Response.json({ success: true, message: "Updater started — installing " + UPDATER_CONFIG.npmPackageName + "@latest..." });
  } catch (e) {
    return Response.json({ success: false, error: e.message }, { status: 500 });
  }
}
