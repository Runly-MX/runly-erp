// Notes image Storage must be private before the API is allowed to start, and
// must stay unreadable to anonymous clients once it is running. These helpers run
// the API image's own preflight as a one-shot container, so the installer needs no
// database driver. Output is codes only; the owner connection travels through the
// process environment, never through arguments, logs or files.
const SCRIPT = "apps/api/scripts/notes-storage-preflight.mjs";

export const NOTES_STORAGE_NOT_PREPARED =
  "NOTES_STORAGE_NOT_PREPARED: the Notes Storage protections (restrictive policy and private-bucket guard) are missing or different and this account cannot create them. " +
  "Set RUNLY_NOTES_OWNER_DATABASE_URL to the Storage owner connection for this run (or apply prisma/prepare-notes-storage-owner.sql as that owner), then re-run. " +
  "The installation was NOT started. Never make the Notes buckets public to work around this.";

export function prepareAndVerifyNotesStorage({ run, dockerRunBase, image, ownerUrl = null, log = console.log }) {
  if (ownerUrl) {
    log("Preparing Notes private image Storage with the configured owner connection...");
    run("docker", [...dockerRunBase, "-e", "RUNLY_NOTES_OWNER_DATABASE_URL", image, "node", SCRIPT, "--prepare-owner"],
      { env: { ...process.env, RUNLY_NOTES_OWNER_DATABASE_URL: ownerUrl } });
  }
  log("Verifying Notes private image Storage (read-only)...");
  try {
    run("docker", [...dockerRunBase, image, "node", SCRIPT, "--verify"]);
  } catch {
    throw new Error(NOTES_STORAGE_NOT_PREPARED);
  }
}

export function probeNotesStorage({ run, dockerRunBase, image, log = console.log }) {
  log("Probing Notes Storage with anonymous requests...");
  try {
    run("docker", [...dockerRunBase, image, "node", SCRIPT, "--probe"]);
  } catch {
    throw new Error("NOTES_STORAGE_ANONYMOUS_ACCESS: an anonymous request could read a Notes image or list the bucket. The installation is NOT safe; do not expose it. Re-run the Storage preparation and check any other permissive policy on storage.objects.");
  }
}
