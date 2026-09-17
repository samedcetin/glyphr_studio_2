/**
	BRAND
	-----
	Who this app says it is, in one place.

	The fork inherited the upstream product's name, domain, and support address
	scattered across sixty-odd files - which meant our users were being sent to
	someone else's help site and their feedback to someone else's inbox. Every
	call site reads from here now, so the day the domain goes live it is one
	file that changes rather than sixty.

	THE LINE BETWEEN OURS AND THEIRS. Copyright and licence notices are not
	branding and are not ours to move: GPL-3.0 requires them kept, and they
	stay on the About page naming Matthew LaGrandeur. What changes is anything
	that says who to talk to, where to get the app, and what the app is called
	- because presenting ourselves as Glyphr Studio would be a trademark
	problem that the GPL does not cure, and GPLv3 section 7(e) provides for
	exactly that removal.

	Documentation is the deliberate exception, see UPSTREAM_HELP below.
 */

/** What the app calls itself, everywhere a person can read it. */
export const PRODUCT_NAME = 'Glyva';

/**
 * The short form, for places with no room for the full name - window titles
 * that already carry a document name, and the like. One word now, so the
 * two are the same; kept as its own constant so the call sites that want
 * the short form keep saying so.
 */
export const PRODUCT_SHORT_NAME = 'Glyva';

/** The studio behind it. */
export const VENDOR_NAME = 'Blue Rain';

/**
 * Where the app lives.
 *
 * TODO: not serving yet. Every link that points at the product goes through
 * this constant, so launching is a one-line change here.
 */
export const PRODUCT_URL = 'https://bluerain.studio/glyva';

/**
 * Where feedback goes.
 *
 * TODO: placeholder. Confirm the address before this ships - until then the
 * mail links are honest about being ours rather than wrong about being
 * someone else's, which is the part that mattered.
 */
export const SUPPORT_EMAIL = 'hello@bluerain.studio';

/**
 * Where the source lives.
 *
 * The GPL obliges us to offer it, so the About page has to link it and the
 * issue tracker under it is where bug reports go. Both were written out by
 * hand in five places before this constant existed.
 */
export const PRODUCT_SOURCE_URL = 'https://github.com/samedcetin/glyphr_studio_2';
export const PRODUCT_ISSUES_URL = `${PRODUCT_SOURCE_URL}/issues`;

/**
 * Upstream's help site, kept on purpose.
 *
 * We have no documentation of our own, and theirs is real, maintained, and
 * still describes most of this editor accurately. Pointing our Help page at a
 * domain that does not answer would be worse for the user than pointing it at
 * the project we forked - and crediting where the writing came from is the
 * honest thing regardless.
 *
 * Replace article by article as our own docs appear, not in one sweep.
 */
export const UPSTREAM_NAME = 'Glyphr Studio';

/**
 * The upstream release this build is based on.
 *
 * Our own version numbers start at 3.0 and no longer track upstream's, so
 * the About page says which upstream code sits underneath. Bump this when
 * upstream changes are merged in, not when we ship.
 */
export const UPSTREAM_VERSION = '2.10.3';
export const UPSTREAM_HELP = 'https://www.glyphrstudio.com/help';
export const UPSTREAM_URL = 'https://www.glyphrstudio.com';
export const UPSTREAM_SOURCE_URL = 'https://github.com/glyphr-studio';
export const UPSTREAM_RELEASES_URL = 'https://github.com/glyphr-studio/Glyphr-Studio-2/releases';
