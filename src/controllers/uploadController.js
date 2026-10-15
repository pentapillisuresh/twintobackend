const { ok, fail } = require('../utils/response');

exports.uploadImage = (req, res) => {
  if (!req.file) return fail(res, 'No file uploaded', 400);

  // Build public URL from request host so it works on LAN + emulator
  const proto = req.protocol;
  const host = req.get('host');
  const url = `${proto}://${host}/uploads/${req.file.filename}`;

  return ok(res, { url, filename: req.file.filename, size: req.file.size }, 'Image uploaded', 201);
};