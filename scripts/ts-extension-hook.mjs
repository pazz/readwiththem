// Vite (and TS's "bundler" moduleResolution) allow extensionless relative
// imports; plain Node ESM does not. This lets check scripts import real,
// multi-file source modules instead of re-implementing their logic to test it.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (err) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return nextResolve(`${specifier}.ts`, context)
    }
    throw err
  }
}
