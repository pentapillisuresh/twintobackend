module.exports = (error, req, res, next) => {
  console.error(error);
  if (res.headersSent) return next(error);
  const status = error.status || 500;
  res.status(status).json({
    success: false,
    message: process.env.NODE_ENV === 'development' || status < 500
      ? error.message
      : 'Internal server error'
  });
};
