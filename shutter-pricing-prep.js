/**
 * shutter-pricing-prep.js
 * PREP FILE — extracted from SHUTTER PRICING 2026.pdf + 2025 Technician Price List.pdf + Slat Comparison.pdf
 * Ready for integration into the quote tool.
 *
 * All pricing tables use clear opening dimensions (width × height) in inches.
 * Prices are MSRP (retail/customer-facing) — NO markup applied. Roll-A-Shield manufactures
 * these shutters in-house, so the table prices go directly to the customer.
 * (This differs from screens, which store dealer cost and apply 1.8x markup.)
 *
 * RESOLVED QUESTIONS:
 *  - 35mm Spring = same product as 38mm Mini Foam-Filled (mislabeled in PDF)
 *  - 55mm only available as Electric/Remote (no manual or spring-loaded)
 *  - Mini Double-Wall (40mm) is DISCONTINUED — removed from this file
 *  - All colors are same price, no surcharge
 *  - No price difference between vented and non-vented slats
 *  - 63mm Single-Wall: only end-retention offered (no non-end-retention option)
 *  - Motor surcharge: basePrice × pct, clamped to [min, max], added on top of electric base
 *  - Electric base price includes a hardwired motor operated by a hardwire switch
 *  - Installation is a SEPARATE LINE ITEM but included in the quote total
 *  - Install $450 tier: applies to ALL 55mm shutters, AND any shutter with width >9ft
 *  - 63mm spring-loaded and electric both use electric install tier ($350, or $450 if >9ft)
 *  - Furring/aluminum bar: per foot of material (sales rep enters total linear feet needed)
 *  - Cleaning is no longer offered — removed from this file
 */

// ═══════════════════════════════════════════════════════════════════════════════
// SLAT TYPES
// ═══════════════════════════════════════════════════════════════════════════════

const SHUTTER_SLAT_TYPES = {
    'mini-foam-filled': {
        label: 'Mini Foam-Filled (38mm)',
        slatMM: 38,
        totalHeight: 1.8,      // inches
        slatHeight: 1.5,       // inches
        profileWidth: 0.4,     // inches
        slatsPerMeter: 27,
        composition: 'Rolled-Aluminum with Foam',
        maxWidth: 150,         // inches (12.5 ft)
        maxArea: 86.1,         // sq ft
        options: ['vented', 'non-vented'],
        endRetention: false,
        colors: ['white', 'cream', 'beige', 'sand', 'grey', 'metallic'],
        protection: { noise: true, thermal: true, wind: true, hail: true, hurricane: false },
        availableOperators: ['pull-strap', 'crank-strap', 'spring-loaded', 'oz-roll', 'motor'],
    },
    'standard-foam-filled': {
        label: 'Standard Foam-Filled (55mm)',
        slatMM: 55,
        totalHeight: 2.6,
        slatHeight: 2.2,
        profileWidth: 0.6,
        slatsPerMeter: 18,
        composition: 'Rolled-Aluminum with Foam',
        maxWidth: 222,         // inches (18.5 ft)
        maxArea: 129.2,        // sq ft
        options: ['vented', 'non-vented'],
        endRetention: false,
        colors: ['white', 'cream', 'beige', 'sand', 'grey', 'metallic', 'bronze'],
        protection: { noise: true, thermal: true, wind: true, hail: true, hurricane: false },
        availableOperators: ['oz-roll', 'motor'],  // Only electric/remote pricing exists
    },
    // Mini Double-Wall (40mm) — DISCONTINUED, not included
    'single-wall': {
        label: 'Single-Wall (63mm)',
        slatMM: 63,
        totalHeight: 2.7,
        slatHeight: 2.5,
        profileWidth: 0.5,
        slatsPerMeter: 19,
        composition: 'Extruded Aluminum',
        maxWidth: 240,         // inches (20 ft)
        maxArea: 422.63,       // sq ft
        options: ['solid', 'perforated'],  // Perforated = +10% surcharge
        endRetention: true,    // End-retention only (non-end-retention not offered)
        colors: ['white', 'cream', 'bronze'],
        protection: { noise: false, thermal: false, wind: true, hail: true, hurricane: true },
        hurricaneMaxWidth: 240,  // 20 ft
        availableOperators: ['spring-loaded', 'motor'],
    },
};

// ═══════════════════════════════════════════════════════════════════════════════
// OPERATOR LIMITS (from Slat Comparison - Operator Requirements table)
// Each entry: { maxArea (sq ft), maxWidth (inches), maxHeight (inches) }
// ═══════════════════════════════════════════════════════════════════════════════

const SHUTTER_OPERATOR_LIMITS = {
    'mini-foam-filled': {
        'pull-strap':    { maxArea: 23, maxWidth: 72, maxHeight: 46 },
        'crank-strap':   { maxArea: 62, maxWidth: 120, maxHeight: 74 },
        'spring-loaded': { maxArea: 77, maxWidth: 132, maxHeight: 84 },
        'oz-roll':       { maxArea: 115, maxWidth: 139, maxHeight: 180 },
        'motor':         { maxArea: 117, maxWidth: 141, maxHeight: 180 },
    },
    'standard-foam-filled': {
        'oz-roll':       { maxArea: 95, maxWidth: 120, maxHeight: 180 },
        'motor':         { maxArea: 157, maxWidth: 173, maxHeight: 180 },
    },
    // Mini Double-Wall — DISCONTINUED
    'single-wall': {
        'pull-strap':    { maxArea: 23, maxWidth: 58, maxHeight: 57 },
        'crank-strap':   { maxArea: 62, maxWidth: 95, maxHeight: 95 },
        'spring-loaded': { maxArea: 93, maxWidth: 116, maxHeight: 116 },
        'oz-roll':       { maxArea: 65, maxWidth: 115, maxHeight: 115 },
        'motor':         { maxArea: 220, maxWidth: 220, maxHeight: 250 },
    },
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAXIMUM HEIGHT BY BOX SIZE (from Slat Comparison)
// End cap size → { clearOpening, overallHeight } per slat type
// Overall height = includes the box
// ═══════════════════════════════════════════════════════════════════════════════

const MAX_HEIGHT_BY_BOX = {
    'mini-foam-filled': {
        '6.5': { clear: 58, overall: 66 },
        '7':   { clear: 68, overall: 77 },
        '8':   { clear: 108, overall: 118 },
        '9':   { clear: 132, overall: 143 },
        '10':  { clear: 145, overall: 180 },
        '12':  { clear: 180, overall: null },  // overall not listed
    },
    'standard-foam-filled': {
        '8':   { clear: 77, overall: 118 },
        '9':   { clear: 132, overall: 143 },
        '10':  { clear: 160, overall: 172 },
        '12':  { clear: 180, overall: 194 },
    },
    // Mini Double-Wall — DISCONTINUED
    // Single-Wall: end-retention only (every-slat end retention)
    'single-wall': {
        '7':   { clear: 46.5, overall: 55 },
        '8':   { clear: 75, overall: 84 },
        '9':   { clear: 95, overall: 105 },
        '10':  { clear: 148, overall: 160 },
        '12':  { clear: 213, overall: 227 },
    },
};

// ═══════════════════════════════════════════════════════════════════════════════
// PRICING TABLES
// Format: { 'widthInches': { 'heightInches': price } }
// All measurements are clear opening
// ═══════════════════════════════════════════════════════════════════════════════

// ── 38mm Insulated (Mini Foam-Filled) — MANUAL ──────────────────────────────
// Operators: Pull Strap, Crank Strap, Gear
const shutterPricing_38mm_manual = {
    '18': { '18': 581, '24': 645, '36': 763, '48': 883, '60': 1003, '72': 1122, '84': 1242, '96': 1361, '108': 1482, '120': 1647, '132': 1772, '144': 1896 },
    '24': { '18': 622, '24': 692, '36': 822, '48': 953, '60': 1084, '72': 1215, '84': 1346, '96': 1478, '108': 1610, '120': 1786, '132': 1922, '144': 2058 },
    '36': { '18': 694, '24': 776, '36': 928, '48': 1082, '60': 1237, '72': 1391, '84': 1545, '96': 1700, '108': 1855, '120': 2054, '132': 2214, '144': 2373 },
    '48': { '18': 766, '24': 859, '36': 1035, '48': 1212, '60': 1390, '72': 1567, '84': 1745, '96': 1922, '108': 2100, '120': 2323, '132': 2505, '144': 2688 },
    '60': { '18': 856, '24': 962, '36': 1163, '48': 1366, '60': 1569, '72': 1772, '84': 1975, '96': 2179, '108': 2383, '120': 2631, '132': 2839 },
    '72': { '18': 928, '24': 1045, '36': 1270, '48': 1496, '60': 1722, '72': 1948, '84': 2174, '96': 2401, '108': 2628 },
    '84': { '18': 1026, '24': 1157, '36': 1408, '48': 1661, '60': 1915, '72': 2168, '84': 2422, '96': 2675 },
    '96': { '18': 1097, '24': 1240, '36': 1515, '48': 1791, '60': 2068, '72': 2344, '84': 2621 },
    '108': { '18': 1210, '24': 1370, '36': 1678, '48': 1989, '60': 2299, '72': 2609 },
    '120': { '18': 1283, '24': 1454, '36': 1786, '48': 2119, '60': 2453 },
    '132': { '18': 1355, '24': 1538, '36': 1892, '48': 2249, '60': 2606 },
    '144': { '18': 1517, '24': 1709, '36': 2085, '48': 2462 },
    '156': { '18': 1588, '24': 1793, '36': 2191, '48': 2592 },
    '168': { '18': 1709, '24': 1932, '36': 2367, '48': 2805 },
    '180': { '18': 1781, '24': 2015, '36': 2474 },
};

// ── 38mm Insulated (Mini Foam-Filled) — ELECTRIC/REMOTE ─────────────────────
// Base price for standard wired electric motor
const shutterPricing_38mm_electric = {
    '24': { '24': 787, '36': 907, '48': 1030, '60': 1152, '72': 1275, '84': 1397, '96': 1520, '108': 1644, '120': 1766, '132': 1889, '144': 2011, '156': 2558 },
    '36': { '24': 863, '36': 1005, '48': 1149, '60': 1294, '72': 1438, '84': 1582, '96': 1726, '108': 1872, '120': 2016, '132': 2161, '144': 2329, '156': 2874 },
    '48': { '24': 939, '36': 1103, '48': 1269, '60': 1435, '72': 1601, '84': 1767, '96': 1933, '108': 2124, '120': 2290, '132': 2456, '144': 2622, '156': 3189 },
    '60': { '24': 1033, '36': 1221, '48': 1411, '60': 1601, '72': 1791, '84': 1981, '96': 2195, '108': 2387, '120': 2577, '132': 2767, '144': 2957, '156': 3548 },
    '72': { '24': 1109, '36': 1319, '48': 1531, '60': 1743, '72': 1979, '84': 2191, '96': 2402, '108': 2616, '120': 2828, '132': 3040, '144': 3252, '156': 3865 },
    '84': { '24': 1211, '36': 1447, '48': 1685, '60': 1922, '72': 2183, '84': 2421, '96': 2658, '108': 2898, '120': 3135, '132': 3399, '144': 3636, '156': 4249 },
    '96': { '24': 1287, '36': 1545, '48': 1804, '60': 2087, '72': 2346, '84': 2606, '96': 2865, '108': 3126, '120': 3411, '132': 3670, '144': 3930, '156': 4564 },
    '108': { '24': 1415, '36': 1705, '48': 2020, '60': 2312, '72': 2603, '84': 2895, '96': 3212, '108': 3505, '120': 3797, '132': 4123, '144': 4414, '156': 5046 },
    '120': { '24': 1491, '36': 1803, '48': 2140, '60': 2453, '72': 2766, '84': 3080, '96': 3419, '108': 3734, '120': 4081, '132': 4395, '144': 4708, '156': 5362 },
    '132': { '24': 1568, '36': 1925, '48': 2261, '60': 2596, '72': 2931, '84': 3292, '96': 3628, '108': 3999, '120': 4334, '132': 4670, '144': 5005, '156': 5681 },
    '144': { '24': 1728, '36': 2104, '48': 2459, '60': 2813, '72': 3194, '84': 3549, '96': 3903, '108': 4294, '120': 4649, '132': 5004, '144': 5398, '156': 6053 },
    '156': { '24': 1804, '36': 2202, '48': 2578, '60': 2955, '72': 3357, '84': 3733, '96': 4144, '108': 4523, '120': 4899, '132': 5315, '144': 5692, '156': 6369 },
    '168': { '24': 1932, '36': 2365, '48': 2776, '60': 3188, '72': 3625, '84': 4071, '96': 4482, '108': 4895, '120': 5347, '132': 5758, '144': 6345, '156': 6881 },
};

// ── 55mm Insulated (Standard Foam-Filled) — ELECTRIC/REMOTE ─────────────────
const shutterPricing_55mm_electric = {
    '36': { '36': 1220, '48': 1366, '60': 1511, '72': 1657, '84': 1803, '96': 1948, '108': 2117, '120': 2263, '132': 2409, '144': 2555, '156': 2700, '168': 2846, '180': 2981, '192': 3115, '204': 3250, '216': 3410, '228': 3544 },
    '48': { '36': 1378, '48': 1551, '60': 1723, '72': 1896, '84': 2092, '96': 2265, '108': 2437, '120': 2610, '132': 2783, '144': 2955, '156': 3128, '168': 3326, '180': 3488, '192': 3649, '204': 3811, '216': 3972, '228': 4133 },
    '60': { '36': 1498, '48': 1692, '60': 1885, '72': 2101, '84': 2295, '96': 2488, '108': 2681, '120': 2874, '132': 3093, '144': 3286, '156': 3479, '168': 3672, '180': 3854, '192': 4070, '204': 4252, '216': 4434, '228': 4616 },
    '72': { '36': 1633, '48': 1851, '60': 2092, '72': 2310, '84': 2528, '96': 2745, '108': 2989, '120': 3206, '132': 3424, '144': 3642, '156': 3894, '168': 4112, '180': 4318, '192': 4525, '204': 4731, '216': 4978, '228': 5184 },
    '84': { '36': 1810, '48': 2081, '60': 2328, '72': 2575, '84': 2822, '96': 3095, '108': 3342, '120': 3623, '132': 3870, '144': 4117, '156': 4364, '168': 4651, '180': 4887, '192': 5123, '204': 5532, '216': 5768, '228': 6004 },
    '96': { '36': 2015, '48': 2292, '60': 2569, '72': 2846, '84': 3149, '96': 3426, '108': 3737, '120': 4014, '132': 4292, '144': 4569, '156': 4885, '168': 5162, '180': 5601, '192': 5867, '204': 6133, '216': 6399, '228': 6665 },
    '108': { '36': 2135, '48': 2433, '60': 2731, '72': 3054, '84': 3352, '96': 3683, '108': 3981, '120': 4279, '132': 4616, '144': 4913, '156': 5384, '168': 5681, '180': 5968, '192': 6254, '204': 6541, '216': 6827, '228': 7114 },
    '120': { '36': 2270, '48': 2592, '60': 2940, '72': 3262, '84': 3618, '96': 3940, '108': 4263, '120': 4625, '132': 4947, '144': 5442, '156': 5764, '168': 6087, '180': 6398, '192': 6709, '204': 7020, '216': 7331, '228': 7642 },
    '132': { '36': 2472, '48': 2812, '60': 3178, '72': 3519, '84': 3893, '96': 4234, '108': 4614, '120': 4954, '132': 5467, '144': 5808, '156': 6149, '168': 6489, '180': 6818, '192': 7148, '204': 7477, '216': 7806, '228': 8194 },
    '144': { '36': 2606, '48': 2971, '60': 3362, '72': 3761, '84': 4126, '96': 4491, '108': 4896, '120': 5434, '132': 5799, '144': 6164, '156': 6529, '168': 6894, '180': 7248, '192': 7602, '204': 8014, '216': 8368, '228': 8722 },
    '156': { '36': 2800, '48': 3224, '60': 3623, '72': 4055, '84': 4454, '96': 4892, '108': 5463, '120': 5862, '132': 6261, '144': 6659, '156': 7058, '168': 7457, '180': 7844, '192': 8290, '204': 8677, '216': 9065, '228': 9452 },
};

// ── 63mm HD Solid (Single-Wall) — ELECTRIC/REMOTE ────────────────────────────
// For 63mm HD Perforated: add +10% surcharge to these prices
const shutterPricing_63mm_electric = {
    '36': { '36': 1423, '48': 1662, '60': 1830, '72': 1997, '84': 2165, '96': 2332, '108': 2527, '120': 2694, '132': 2862, '144': 3029, '156': 3197, '168': 3364, '180': 3532, '192': 3683, '204': 3835, '216': 3986, '228': 4138, '240': 4319 },
    '48': { '36': 1595, '48': 1855, '60': 2042, '72': 2230, '84': 2445, '96': 2633, '108': 2821, '120': 3008, '132': 3196, '144': 3384, '156': 3571, '168': 3759, '180': 3977, '192': 4148, '204': 4320, '216': 4492, '228': 4663, '240': 4875 },
    '60': { '36': 1752, '48': 2034, '60': 2244, '72': 2480, '84': 2690, '96': 2900, '108': 3109, '120': 3319, '132': 3529, '144': 3768, '156': 3978, '168': 4188, '180': 4397, '192': 4630, '204': 4824, '216': 5018, '228': 5211, '240': 5405 },
    '72': { '36': 1895, '48': 2194, '60': 2449, '72': 2676, '84': 2903, '96': 3131, '108': 3358, '120': 3615, '132': 3842, '144': 4069, '156': 4296, '168': 4563, '180': 4790, '192': 5002, '204': 5213, '216': 5424, '228': 5681, '240': 5893 },
    '84': { '36': 2094, '48': 2447, '60': 2701, '72': 2954, '84': 3208, '96': 3462, '108': 3745, '120': 3999, '132': 4252, '144': 4546, '156': 4799, '168': 5053, '180': 5307, '192': 5590, '204': 5828, '216': 6066, '228': 6505, '240': 6743 },
    '96': { '36': 2292, '48': 2669, '60': 2946, '72': 3224, '84': 3501, '96': 3809, '108': 4086, '120': 4403, '132': 4681, '144': 4958, '156': 5236, '168': 5559, '180': 5837, '192': 6098, '204': 6561, '216': 6823, '228': 7084, '240': 7346 },
    '108': { '36': 2477, '48': 2848, '60': 3148, '72': 3447, '84': 3776, '96': 4076, '108': 4415, '120': 4714, '132': 5013, '144': 5313, '156': 5658, '168': 5958, '180': 6459, '192': 6743, '204': 7026, '216': 7309, '228': 7593, '240': 7876 },
    '120': { '36': 2619, '48': 3008, '60': 3325, '72': 3672, '84': 3989, '96': 4346, '108': 4663, '120': 4979, '132': 5343, '144': 5660, '156': 5977, '168': 6495, '180': 6812, '192': 7113, '204': 7414, '216': 7715, '228': 8016, '240': 8317 },
    '132': { '36': 2873, '48': 3281, '60': 3618, '72': 3984, '84': 4320, '96': 4696, '108': 5032, '120': 5414, '132': 5751, '144': 6289, '156': 6625, '168': 6961, '180': 7297, '192': 7618, '204': 7938, '216': 8258, '228': 8578, '240': 8899 },
    '144': { '36': 3016, '48': 3442, '60': 3825, '72': 4179, '84': 4572, '96': 4926, '108': 5280, '120': 5680, '132': 6236, '144': 6589, '156': 6943, '168': 7297, '180': 7651, '192': 7988, '204': 8326, '216': 8664, '228': 9002, '240': 9408 },
    '156': { '36': 3244, '48': 3703, '60': 4119, '72': 4506, '84': 4932, '96': 5318, '108': 5751, '120': 6138, '132': 6726, '144': 7113, '156': 7499, '168': 7886, '180': 8272, '192': 8643, '204': 9013, '216': 9452, '228': 9822, '240': 10193 },
};

// ── 63mm HD Solid (Single-Wall) — SPRING LOADED ──────────────────────────────
// For 63mm HD Perforated Spring: add +10% surcharge
const shutterPricing_63mm_spring = {
    '24': { '24': 981, '36': 1091, '48': 1205, '60': 1316, '72': 1428, '84': 1544, '96': 1658, '108': 1773, '120': 1885, '132': 1997, '144': 2143 },
    '36': { '24': 1079, '36': 1208, '48': 1340, '60': 1478, '72': 1626, '84': 1764, '96': 1879, '108': 2011, '120': 2143, '132': 2275, '144': 2442 },
    '48': { '24': 1180, '36': 1327, '48': 1478, '60': 1634, '72': 1785, '84': 1952, '96': 2119, '108': 2273, '120': 2427, '132': 2581, '144': 2791 },
    '60': { '24': 1274, '36': 1442, '48': 1618, '60': 1785, '72': 1996, '84': 2158, '96': 2334, '108': 2503, '120': 2762, '132': 2936, '144': 3110 },
    '72': { '24': 1360, '36': 1544, '48': 1731, '60': 1920, '72': 2124, '84': 2322, '96': 2492, '108': 2680, '120': 2868, '132': 3087, '144': 3362 },
    '84': { '24': 1487, '36': 1694, '48': 1905, '60': 2113, '72': 2341, '84': 2579, '96': 2840, '108': 3055, '120': 3294, '132': 3425, '144': 3724 },
    '96': { '24': 1620, '36': 1852, '48': 2085, '60': 2335, '72': 2598, '84': 2882, '96': 3063, '108': 3388, '120': 3543, '132': 3868, '144': 4108 },
    '108': { '24': 1704, '36': 1953, '48': 2200, '60': 2455, '72': 2748, '84': 3049, '96': 3308, '108': 3504, '120': 3817, '132': 4102, '144': 4359 },
    '120': { '24': 1799, '36': 2067, '48': 2334, '60': 2610, '72': 2900, '84': 3200, '96': 3523, '108': 3739, '120': 4072 },
};

// ── 38mm Insulated (Mini Foam-Filled) — SPRING LOADED ────────────────────────
// (Labeled "35mm" in the PDF but confirmed to be the same 38mm Mini Foam-Filled product)
const shutterPricing_38mm_spring = {
    '18': { '18': 812, '24': 866, '36': 964, '48': 1062, '60': 1161, '72': 1254, '84': 1352, '96': 1452, '108': 1550, '120': 1648, '132': 1806, '144': 1904 },
    '24': { '18': 840, '24': 899, '36': 1005, '48': 1116, '60': 1224, '72': 1333, '84': 1441, '96': 1554, '108': 1653, '120': 1761, '132': 1871, '144': 1979 },
    '36': { '18': 896, '24': 964, '36': 1090, '48': 1217, '60': 1339, '72': 1477, '84': 1604, '96': 1751, '108': 1853, '120': 1980, '132': 2106, '144': 2232 },
    '48': { '18': 953, '24': 1030, '36': 1174, '48': 1320, '60': 1466, '72': 1611, '84': 1756, '96': 1899, '108': 2044, '120': 2200, '132': 2345, '144': 2490 },
    '60': { '18': 1023, '24': 1110, '36': 1275, '48': 1442, '60': 1609, '72': 1775, '84': 1937, '96': 2116, '108': 2282, '120': 2447, '132': 2613, '144': 2832 },
    '72': { '18': 1103, '24': 1201, '36': 1389, '48': 1578, '60': 1762, '72': 1959, '84': 2149, '96': 2353, '108': 2526, '120': 2715, '132': 2904, '144': 3092 },
    '84': { '18': 1200, '24': 1307, '36': 1513, '48': 1722, '60': 1925, '72': 2129, '84': 2336, '96': 2567, '108': 2774, '120': 3023, '132': 3231, '144': 3385 },
    '96': { '18': 1256, '24': 1373, '36': 1598, '48': 1820, '60': 2043, '72': 2269, '84': 2517, '96': 2787, '108': 3013, '120': 3182, '132': 3488, '144': 3635 },
    '108': { '18': 1345, '24': 1474, '36': 1723, '48': 1969, '60': 2213, '72': 2465, '84': 2722, '96': 2988, '108': 3280, '120': 3530, '132': 3722, '144': 4052 },
    '120': { '18': 1401, '24': 1540, '36': 1807, '48': 2076, '60': 2335, '72': 2606, '84': 2882, '96': 3166, '108': 3477, '120': 3746, '132': 3957 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// MOTOR SURCHARGES (for Electric/Remote tables)
// Applied as: max(base_price × surcharge%, minimum) capped at maximum
// Base price comes from the electric/remote table (which includes standard wired motor)
// ═══════════════════════════════════════════════════════════════════════════════

const SHUTTER_MOTOR_SURCHARGES = {
    'rts':     { pct: 0.05, min: 100, max: 250 },   // Gaposa RTS (wireless remote)
    'somfy':   { pct: 0.05, min: 123, max: 350 },   // Somfy motor
    'cmo':     { pct: 0.10, min: 200, max: 350 },   // CMO motor
    'rts-cmo': { pct: 0.15, min: 300, max: 500 },   // RTS + CMO combo
    'solar':   { pct: 0.18, min: 350, max: 550 },   // Solar motor
};

// ═══════════════════════════════════════════════════════════════════════════════
// REMOTE / CONTROL OPTIONS (for motorized shutters)
// ═══════════════════════════════════════════════════════════════════════════════

const SHUTTER_REMOTE_OPTIONS = [
    { id: 'handheld-1ch',  name: 'Handheld Single Channel', price: 96 },
    { id: 'handheld-multi', name: 'Handheld Multi-Channel', price: 115 },
    { id: 'handheld-16ch', name: 'Handheld 16-Channel', price: 287 },
    { id: 'on-wall-1ch',   name: 'On-Wall Single Channel', price: 92 },
    { id: 'on-wall-multi', name: 'On-Wall Multi Channel', price: 113 },
    { id: 'digital-keypad', name: 'Digital Keypad', price: 229 },
    { id: 'gaposa-roll-app', name: 'Gaposa Roll App', price: 383 },
];

// ═══════════════════════════════════════════════════════════════════════════════
// ADDITIONAL OPTIONS / ACCESSORIES
// ═══════════════════════════════════════════════════════════════════════════════

// Options for MANUAL shutters (38mm manual table)
const SHUTTER_OPTIONS_MANUAL = [
    { id: 'gear-universal', name: 'Gear w/ Universal', price: 140 },
    { id: 'gear-gosnell',   name: 'Gear w/ Gosnell', price: 102 },
    { id: 'furring',        name: 'Furring', price: 7.06, unit: 'per-foot' },
];

// Options for ELECTRIC/REMOTE shutters (38mm, 55mm, 63mm electric tables)
const SHUTTER_OPTIONS_ELECTRIC = [
    { id: 'key-switch',    name: 'Key Switch (Electric)', price: 200 },
    { id: 'oz-roll',       name: 'OZ Roll (Battery)', price: 175 },
    { id: 'storm-bar',     name: 'Storm Bar', price: 140, unit: 'per-side' },
    { id: 'furring',       name: 'Furring', price: 7.06, unit: 'per-foot' },
];

// Options for SPRING LOADED shutters (35mm, 63mm spring tables)
const SHUTTER_OPTIONS_SPRING = [
    { id: 'key-lock',      name: 'Key Lock', price: 140 },
    { id: 'thumb-lock',    name: 'Thumb Lock', price: 35 },
    { id: 'aluminum-bar',  name: 'Aluminum Bar', price: 3.00, unit: 'per-foot' },
    { id: 'furring',       name: 'Furring', price: 7.06, unit: 'per-foot' },
];

// 63mm HD Perforated surcharge (applies to both electric and spring 63mm tables)
const PERFORATED_SURCHARGE = 0.10;  // +10%

// ═══════════════════════════════════════════════════════════════════════════════
// INSTALLATION PRICING (from 2025 Technician Labor Pricelist)
// ═══════════════════════════════════════════════════════════════════════════════

const SHUTTER_INSTALLATION_PRICING = {
    // Per-shutter install labor by operator type
    // RULE: If slat is 55mm (Standard Foam-Filled) OR width >108" (9ft), always use $450
    install: {
        'manual':          300,  // Pull strap, crank (38mm only)
        'oz-roll-solar':   300,  // OZ Roll (battery) or Solar motor
        'electric-remote': 350,  // Wired electric / RTS / Somfy / spring-loaded (63mm spring uses this too)
        'large':           450,  // ALL 55mm shutters, OR any shutter with width > 9ft (108")
    },
    // Per-shutter add-ons
    addOns: {
        '2nd-story':       60,   // Per shutter (varies)
        'furring':         45,   // Per shutter install labor (separate from $7.06/ft materials furring!)
        'extra-wire':      45,   // Per shutter
        'storm-bar':       60,   // Per shutter
        'on-wall-remote':  25,   // Labor to mount on-wall remote
        'key-switch':      40,   // Labor to install key switch
    },
};

/**
 * Get shutter installation price for a single shutter.
 * @param {string} slatType - 'mini-foam-filled', 'standard-foam-filled', or 'single-wall'
 * @param {string} operator - 'pull-strap', 'crank-strap', 'spring-loaded', 'oz-roll', 'motor'
 * @param {number} widthInches - clear opening width in inches
 * @returns {number} installation price
 */
function getShutterInstallPrice(slatType, operator, widthInches) {
    // 55mm always gets $450; any shutter >9ft wide gets $450
    if (slatType === 'standard-foam-filled' || widthInches > 108) {
        return SHUTTER_INSTALLATION_PRICING.install['large'];
    }
    // Manual operators (pull strap, crank)
    if (operator === 'pull-strap' || operator === 'crank-strap') {
        return SHUTTER_INSTALLATION_PRICING.install['manual'];
    }
    // OZ Roll or Solar motor
    if (operator === 'oz-roll' || operator === 'solar') {
        return SHUTTER_INSTALLATION_PRICING.install['oz-roll-solar'];
    }
    // Everything else: wired electric, RTS, Somfy, CMO, spring-loaded
    return SHUTTER_INSTALLATION_PRICING.install['electric-remote'];
}

// Cleaning pricing REMOVED — no longer offered

// ═══════════════════════════════════════════════════════════════════════════════
// PRICING LOGIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the base shutter pricing table for a given slat type and operator category.
 * Returns null if combination is not available.
 */
function getShutterPricingTable(slatType, operatorCategory) {
    if (slatType === 'mini-foam-filled') {
        if (operatorCategory === 'manual') return shutterPricing_38mm_manual;
        if (operatorCategory === 'electric') return shutterPricing_38mm_electric;
        if (operatorCategory === 'spring') return shutterPricing_38mm_spring;
    }
    if (slatType === 'standard-foam-filled') {
        if (operatorCategory === 'electric') return shutterPricing_55mm_electric;
        return null;  // 55mm only available as electric/remote
    }
    if (slatType === 'single-wall') {
        if (operatorCategory === 'electric') return shutterPricing_63mm_electric;
        if (operatorCategory === 'spring') return shutterPricing_63mm_spring;
        return null;  // 63mm: electric or spring only
    }
    return null;
}

/**
 * Calculate motor surcharge for electric/remote shutters.
 * @param {number} basePrice - price from electric/remote table
 * @param {string} motorType - key from SHUTTER_MOTOR_SURCHARGES (or null for hardwired)
 * @returns {number} surcharge amount (0 for hardwired base motor)
 */
function calculateMotorSurcharge(basePrice, motorType) {
    if (!motorType) return 0;  // Hardwired motor included in base price
    const surcharge = SHUTTER_MOTOR_SURCHARGES[motorType];
    if (!surcharge) return 0;
    const calculated = basePrice * surcharge.pct;
    return Math.min(Math.max(calculated, surcharge.min), surcharge.max);
}

// ─── Conditional exports for Node.js testing ────────────────────────────────
if (typeof module !== 'undefined') {
    module.exports = {
        SHUTTER_SLAT_TYPES, SHUTTER_OPERATOR_LIMITS, MAX_HEIGHT_BY_BOX,
        shutterPricing_38mm_manual, shutterPricing_38mm_electric, shutterPricing_38mm_spring,
        shutterPricing_55mm_electric,
        shutterPricing_63mm_electric, shutterPricing_63mm_spring,
        SHUTTER_MOTOR_SURCHARGES, SHUTTER_REMOTE_OPTIONS,
        SHUTTER_OPTIONS_MANUAL, SHUTTER_OPTIONS_ELECTRIC, SHUTTER_OPTIONS_SPRING,
        PERFORATED_SURCHARGE, SHUTTER_INSTALLATION_PRICING,
        getShutterPricingTable, calculateMotorSurcharge, getShutterInstallPrice,
    };
}
