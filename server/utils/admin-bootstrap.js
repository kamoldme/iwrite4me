// Never replace or create credentials from a built-in default.
function adminBootstrapAction({ exists, password, staging }) {
  if (!password) return 'preserve';
  if (!exists) return 'seed';
  return staging ? 'preserve' : 'sync';
}

module.exports = { adminBootstrapAction };
