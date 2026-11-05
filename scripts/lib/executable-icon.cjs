/** Embed and verify the icon resources used by Windows Explorer. */
const fs = require('node:fs');
const crypto = require('node:crypto');
const { NtExecutable, NtExecutableResource } = require('pe-library');
const { Data, Resource } = require('resedit');

function readExecutable(executablePath) {
  // Changing resources invalidates the original runtime signature; packaging signs later.
  return NtExecutable.from(fs.readFileSync(executablePath), { ignoreCert: true });
}

function readIcons(iconPath) {
  const icons = Data.IconFile.from(fs.readFileSync(iconPath)).icons.map((item) => item.data);
  if (!icons.length) throw new Error(`Application icon contains no images: ${iconPath}`);
  return icons;
}

function iconSignatures(icons) {
  return icons
    .map((icon) =>
      crypto
        .createHash('sha256')
        .update(Buffer.from(icon.isRaw() ? icon.bin : icon.generate()))
        .digest('hex'),
    )
    .sort();
}

function setExecutableIcon(executablePath, iconPath) {
  const executable = readExecutable(executablePath);
  const resources = NtExecutableResource.from(executable);
  const icons = readIcons(iconPath);
  const groups = Resource.IconGroupEntry.fromEntries(resources.entries);
  // Replace every language variant so Windows cannot fall back to a runtime icon.
  for (const group of groups.length ? groups : [{ id: 1, lang: 0 }]) {
    Resource.IconGroupEntry.replaceIconsForResource(resources.entries, group.id, group.lang, icons);
  }
  resources.outputResource(executable);
  fs.writeFileSync(executablePath, Buffer.from(executable.generate()));
}

function verifyExecutableIcon(executablePath, iconPath) {
  const resources = NtExecutableResource.from(readExecutable(executablePath));
  const groups = Resource.IconGroupEntry.fromEntries(resources.entries);
  const expected = iconSignatures(readIcons(iconPath));
  if (!groups.length) throw new Error(`Executable has no embedded icon: ${executablePath}`);
  for (const group of groups) {
    const actual = iconSignatures(group.getIconItemsFromEntries(resources.entries));
    if (
      actual.length !== expected.length ||
      actual.some((hash, index) => hash !== expected[index])
    ) {
      throw new Error(`Embedded icon differs from the application icon: ${executablePath}`);
    }
  }
}

module.exports = { setExecutableIcon, verifyExecutableIcon };
