/**
 * BuildingTypes — Semantic building role registry for roadside city generation.
 *
 * Every role carries placement rules relative to the ROAD FRAME, not world space.
 * The generator never picks arbitrary world positions — it picks a slot along the
 * road's frontage and derives the world position from the road frame.
 *
 * Zone model (offsets measured from road centerline, per side):
 *
 *   ROAD 0–13m │ GUARDRAIL ~12.6m │ SIDEWALK 13.1–16.7m │
 *   FRONTAGE (small commercial, faces road) │ COURTYARD GAP │
 *   LARGE BLOCKS (connected row) │ BACKGROUND TOWERS
 */

// Road geometry constants (mirrors world.js road layout)
export const ROAD_HALF_WIDTH = 13.0;
export const SIDEWALK_OUTER = 16.7;   // outer edge of sidewalk ribbon (14.9 + 3.6/2)
export const ROAD_CLEARANCE = 17.2;   // hard minimum: nothing may intrude inside this radius

// Depth-band anchors for the three building layers
export const ZONE = {
    FRONTAGE_FRONT: 17.4,   // front face line for small commercial buildings
    LARGE_FRONT: 26.5,      // front face line for the connected large-block row
    TOWER_MIN: 50.0,        // background tower band start
    TOWER_MAX: 72.0,        // background tower band end
};

/**
 * FRONTAGE layer roles — small commercial objects.
 * Must sit close to the sidewalk, must face the road, must never block the lane.
 * `depth` is measured back away from the frontage line.
 */
export const FRONTAGE_TYPES = {
    FoodStall: {
        weight: 3,
        width: [2.6, 4.2], depth: [2.0, 3.0], height: [2.6, 3.4],
        roadFacing: true, jitterDeg: 5, canopy: true, signChance: 0.9,
        bodyMat: 'stall',
    },
    Cart: {
        weight: 2,
        width: [1.6, 2.4], depth: [1.2, 1.9], height: [1.9, 2.4],
        roadFacing: true, jitterDeg: 8, canopy: true, signChance: 0.4,
        bodyMat: 'stall',
    },
    Kiosk: {
        weight: 2,
        width: [2.4, 3.6], depth: [2.0, 3.2], height: [2.8, 3.8],
        roadFacing: true, jitterDeg: 4, canopy: false, signChance: 1.0,
        bodyMat: 'kiosk',
    },
    SmallShop: {
        weight: 4,
        width: [5.0, 9.0], depth: [4.0, 7.0], height: [3.6, 6.5],
        roadFacing: true, jitterDeg: 2, canopy: true, signChance: 0.95,
        bodyMat: 'brick', storefront: true,
    },
    Restaurant: {
        weight: 3,
        width: [7.0, 12.0], depth: [5.0, 8.0], height: [4.0, 7.0],
        roadFacing: true, jitterDeg: 2, canopy: true, signChance: 1.0,
        bodyMat: 'commercial', storefront: true,
    },
    ConvenienceStore: {
        weight: 3,
        width: [6.0, 10.0], depth: [5.0, 8.0], height: [3.8, 6.0],
        roadFacing: true, jitterDeg: 2, canopy: true, signChance: 1.0,
        bodyMat: 'commercial', storefront: true,
    },
};

/**
 * LARGE layer roles — connected city blocks behind the frontage.
 * Allowed to touch each other (shared-wall city fabric) with controlled
 * variation in height / width / depth / facade / setbacks.
 */
export const LARGE_TYPES = {
    Apartment: {
        weight: 4,
        width: [14.0, 24.0], depth: [10.0, 16.0], height: [10.0, 28.0],
        facade: 'brick', setbackChance: 0.25,
    },
    Office: {
        weight: 3,
        width: [16.0, 26.0], depth: [12.0, 18.0], height: [18.0, 45.0],
        facade: 'modern', setbackChance: 0.35,
    },
    CommercialBlock: {
        weight: 3,
        width: [18.0, 28.0], depth: [12.0, 18.0], height: [8.0, 20.0],
        facade: 'commercial', setbackChance: 0.2,
    },
};

/**
 * BACKGROUND layer role — sparse skyline towers far behind the block row.
 */
export const TOWER_TYPE = {
    width: [18.0, 30.0], depth: [14.0, 24.0], height: [38.0, 110.0],
    facades: ['modern', 'commercial'],
    spacing: [38.0, 60.0],   // distance between tower centers along-track
    beacon: true,
};

/** Pick a weighted key from a role table, given rng() ∈ [0,1) sequence. */
export function pickRole(table, rng) {
    let total = 0;
    for (const key in table) total += table[key].weight;
    let roll = rng() * total;
    for (const key in table) {
        roll -= table[key].weight;
        if (roll <= 0) return key;
    }
    return Object.keys(table)[0];
}

/** Sample a [min,max] range with an rng. */
export function sampleRange(range, rng) {
    return range[0] + (range[1] - range[0]) * rng();
}
