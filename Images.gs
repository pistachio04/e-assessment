/**
 * Images.gs — unggah gambar soal ke Google Drive.
 *
 * Gambar disimpan di folder "E-Assessment Images" (milik pemilik script) dan dibagikan
 * "siapa saja yang memiliki link" (hanya lihat) agar tampil di browser siswa.
 * Di soal/opsi/pembahasan gambar dirujuk dengan markup: ![](drive:FILEID)
 */

const IMAGE_FOLDER_NAME = "E-Assessment Images";
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
const IMAGE_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

function imageFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("IMG_FOLDER_ID");
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (e) {
      /* folder terhapus -> buat baru */
    }
  }
  const folder = DriveApp.createFolder(IMAGE_FOLDER_NAME);
  props.setProperty("IMG_FOLDER_ID", folder.getId());
  return folder;
}

/** p.dataUrl = "data:image/jpeg;base64,...." (sudah diperkecil di browser). */
function uploadImage_(p) {
  const m =
    /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+\/=]+)$/.exec(
      String(p.dataUrl || ""),
    );
  if (!m)
    throw new UserError(
      "Format gambar tidak valid (gunakan PNG, JPG, GIF, atau WEBP).",
    );
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > MAX_IMAGE_BYTES)
    throw new UserError("Ukuran gambar terlalu besar (maks. 2,5 MB).");

  const blob = Utilities.newBlob(
    bytes,
    m[1],
    "soal-" + Date.now() + "." + IMAGE_EXT[m[1]],
  );
  const file = imageFolder_().createFile(blob);
  let shared = true;
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (e) {
    shared = false; // kebijakan domain Workspace bisa melarang berbagi publik
  }
  return {
    id: file.getId(),
    markup: "![](drive:" + file.getId() + ")",
    shared: shared,
  };
}
