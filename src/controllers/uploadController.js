const { ok, fail } = require('../utils/response');

exports.uploadImage = (req, res) => {
  if (!req.file) {
    return fail(res, 'No file uploaded', 400);
  }

  const baseUrl = (
    process.env.PUBLIC_BACKEND_URL ||
    'https://service.twinto.store'
  ).replace(/\/+$/, '');

  const url = `${baseUrl}/uploads/${encodeURIComponent(req.file.filename)}`;

  return ok(
    res,
    {
      url,
      filename: req.file.filename,
      size: req.file.size
    },
    'Image uploaded',
    201
  );
};