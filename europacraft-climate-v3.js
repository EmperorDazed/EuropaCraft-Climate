/* ============================================================================
   EuropaCraft Weather Simulator
   Climate Background Model
   File: europacraft-climate-v3.js
   Version 7.3

   COMPLETE COMPATIBLE REPLACEMENT

   PURPOSE

   This module provides the long-term geographical climate background used by
   the persistent atmosphere.

   IMPORTANT DESIGN RULE

   This file does NOT generate weather anomalies.

   It provides:
       - climate influence weights
       - maritime / continental indices
       - regional climate modifiers
       - seasonal climatological temperature
       - hourly climatological temperature

   The atmosphere simulates ACTUAL temperature separately.

   Anomaly is calculated elsewhere as:

       actual temperature - climatological temperature

   REQUIRED GLOBAL EXPORT

       window.EuropaClimate

   REQUIRED API

       EuropaClimate.version
       EuropaClimate.bounds
       EuropaClimate.types
       EuropaClimate.normalize(raw)
       EuropaClimate.getClimate(lat, lon, options)
       EuropaClimate.getIndices(lat, lon, options)
       EuropaClimate.getBaselineTemperature(lat, lon, date, options)

============================================================================ */

(function (global) {
"use strict";


const C = global.EuropaConfig;
const U = global.EuropaUtils;


/* ============================================================================
   BASIC SAFETY
============================================================================ */

if (!C) {
    throw new Error(
        "europacraft-climate-v3.js requires EuropaConfig."
    );
}


if (!U) {
    throw new Error(
        "europacraft-climate-v3.js requires EuropaUtils."
    );
}


/* ============================================================================
   CLIMATE TYPES
============================================================================ */

const TYPES = Array.isArray(
    C.climate &&
    C.climate.types
)
    ? C.climate.types.slice()
    : [
        "Atlantic",
        "Polar Maritime",
        "Arctic Maritime",
        "Greenland Ice-Sheet",
        "North Sea",
        "Baltic Maritime",
        "Mediterranean",
        "Black Sea",
        "Caspian Maritime",
        "North African",
        "Eurasian Continental",
        "British Landmass",
        "Iberian Interior",
        "West-Central European",
        "Central / Eastern European",
        "Scandinavian Interior",
        "Balkan Modified",
        "Anatolian Interior"
    ];


/* ============================================================================
   CLIMATE TYPE INDEX
============================================================================ */

const TYPE_INDEX = Object.create(
    null
);


for (
    let i = 0;
    i < TYPES.length;
    i++
) {

    TYPE_INDEX[
        TYPES[i]
    ] = i;
}


/* ============================================================================
   HELPERS
============================================================================ */

function finite(
    value,
    fallback = 0
) {

    const number = Number(
        value
    );


    return Number.isFinite(
        number
    )
        ? number
        : fallback;
}


function clamp01(
    value
) {

    return U.clamp(
        value,
        0,
        1
    );
}


function safeTerrain(
    options
) {

    if (
        options &&
        options.terrain
    ) {

        return options.terrain;
    }


    return null;
}


/* ============================================================================
   WEIGHT OBJECT
============================================================================ */

function emptyWeights() {

    const result = {};


    for (
        const type of TYPES
    ) {

        result[type] = 0;
    }


    return result;
}


/* ============================================================================
   NORMALISATION

   Raw weights are independent strengths.

   They do NOT need to add to 100 before this function.

   This function converts them into a 100% composition.
============================================================================ */

function normalize(
    raw
) {

    const result = (
        emptyWeights()
    );


    let total = 0;


    for (
        const type of TYPES
    ) {

        const value = Math.max(

            0,

            finite(
                raw &&
                raw[type],
                0
            )
        );


        result[type] = (
            value
        );


        total += (
            value
        );
    }


    if (
        total <=
        0
    ) {

        result["West-Central European"] = (
            100
        );


        return result;
    }


    const scale = (
        100 /
        total
    );


    for (
        const type of TYPES
    ) {

        result[type] *= (
            scale
        );
    }


    return result;
}


/* ============================================================================
   DISTANCE-BASED ANCHOR INFLUENCE
============================================================================ */

function anchorInfluence(
    lat,
    lon,
    anchor
) {

    const distanceKm = (
        U.haversineKm(

            lat,

            lon,

            finite(
                anchor.lat
            ),

            finite(
                anchor.lon
            )
        )
    );


    const radiusKm = Math.max(

        50,

        finite(
            anchor.radiusKm,
            800
        )
    );


    /*
     * Gaussian falloff.

     * Influence is still noticeable beyond nominal radius,
     * avoiding artificial climate boundaries.
     */

    return Math.exp(

        -0.5 *

        Math.pow(
            distanceKm /
            radiusKm,
            2
        )
    );
}


/* ============================================================================
   BROAD CLIMATE WEIGHTS
============================================================================ */

function broadClimateWeights(
    lat,
    lon
) {

    const raw = (
        emptyWeights()
    );


    const anchors = (

        C.climate &&
        Array.isArray(
            C.climate.anchors
        )

            ? C.climate.anchors

            : []
    );


    for (
        const anchor
        of anchors
    ) {

        const influence = (
            anchorInfluence(
                lat,
                lon,
                anchor
            )
        );


        const weightScale = finite(
            anchor.weight,
            1
        );


        const type = (
            anchor.type
        );


        if (
            Object.prototype.hasOwnProperty.call(
                raw,
                type
            )
        ) {

            raw[type] += (

                influence *
                weightScale
            );
        }
    }


    /* ========================================================================
       GEOGRAPHICAL SAFETY PRIORS

       These prevent areas far from an explicit anchor from becoming empty.
       ======================================================================== */


    /* Atlantic Europe */

    raw["Atlantic"] += (

        U.gaussian(
            Math.max(
                0,
                lon + 12
            ),
            14
        ) *

        U.gaussian(
            lat - 52,
            18
        ) *

        0.35
    );


    /* Eurasian continental */

    raw["Eurasian Continental"] += (

        U.smoothstep(
            8,
            40,
            lon
        ) *

        U.gaussian(
            lat - 54,
            20
        ) *

        0.45
    );


    /* Mediterranean */

    raw["Mediterranean"] += (

        U.gaussian(
            lat - 38,
            8
        ) *

        U.gaussian(
            lon - 16,
            24
        ) *

        0.32
    );


    /* Arctic */

    raw["Arctic Maritime"] += (

        U.smoothstep(
            62,
            74,
            lat
        ) *

        0.32
    );


    /* North Sea */

    raw["North Sea"] += (

        U.gaussian2D(

            lon - 3,

            lat - 56,

            7,

            6
        ) *

        0.35
    );


    /* Baltic */

    raw["Baltic Maritime"] += (

        U.gaussian2D(

            lon - 20,

            lat - 58,

            8,

            7
        ) *

        0.35
    );


    /* Central / Eastern Europe */

    raw["Central / Eastern European"] += (

        U.gaussian2D(

            lon - 23,

            lat - 51,

            13,

            10
        ) *

        0.30
    );


    /* West-Central Europe */

    raw["West-Central European"] += (

        U.gaussian2D(

            lon - 9,

            lat - 49,

            13,

            10
        ) *

        0.32
    );


    return raw;
}


/* ============================================================================
   LOCAL REGIONAL MODIFIERS
============================================================================ */

function localModifierBlend(
    lat,
    lon
) {

    const result = {

        temperatureOffsetC:
            0,

        maritimeAdjustment:
            0,

        continentalAdjustment:
            0,

        totalInfluence:
            0
    };


    const modifiers = (

        C.climate &&
        Array.isArray(
            C.climate.localModifiers
        )

            ? C.climate.localModifiers

            : []
    );


    let weightTotal = 0;


    for (
        const modifier
        of modifiers
    ) {

        const radiusKm = Math.max(

            40,

            finite(
                modifier.radiusKm,
                300
            )
        );


        const distanceKm = (
            U.haversineKm(

                lat,

                lon,

                finite(
                    modifier.lat
                ),

                finite(
                    modifier.lon
                )
            )
        );


        /*
         * Compact smooth kernel.

         * At radius boundary influence reaches zero.
         */

        const weight = (
            U.compactKernel(

                distanceKm,

                radiusKm
            )
        );


        if (
            weight <=
            0
        ) {

            continue;
        }


        result.temperatureOffsetC += (

            finite(
                modifier.tempOffsetC,
                0
            ) *

            weight
        );


        result.maritimeAdjustment += (

            finite(
                modifier.maritimeAdjustment,
                0
            ) *

            weight
        );


        result.continentalAdjustment += (

            finite(
                modifier.continentalAdjustment,
                0
            ) *

            weight
        );


        weightTotal += (
            weight
        );
    }


    /*
     * Do not divide by total weight completely because overlapping
     * neighbouring regional corrections are intentionally cumulative.

     * Instead use a soft overlap limiter.
     */

    if (
        weightTotal >
        1
    ) {

        const limiter = (

            1 /
            Math.sqrt(
                weightTotal
            )
        );


        result.temperatureOffsetC *= (
            limiter
        );


        result.maritimeAdjustment *= (
            limiter
        );


        result.continentalAdjustment *= (
            limiter
        );
    }


    result.totalInfluence = Math.min(

        1,

        weightTotal
    );


    return result;
}


/* ============================================================================
   TERRAIN SAMPLE
============================================================================ */

function terrainSample(
    lat,
    lon,
    options
) {

    const terrain = (
        safeTerrain(
            options
        )
    );


    if (
        terrain &&
        typeof terrain.sample ===
        "function"
    ) {

        const sample = (
            terrain.sample(
                lat,
                lon
            )
        );


        return {

            landFraction:
                finite(
                    sample.landFraction,
                    1
                ),

            altitudeM:
                finite(
                    sample.altitudeM,
                    0
                ),

            maritime:
                clamp01(
                    finite(
                        sample.maritime,
                        0.5
                    )
                ),

            continental:
                clamp01(
                    finite(
                        sample.continental,
                        0.5
                    )
                ),

            distanceToSeaKm:
                finite(
                    sample.distanceToSeaKm,
                    500
                ),

            distanceToLandKm:
                finite(
                    sample.distanceToLandKm,
                    0
                )
        };
    }


    /*
     * Fallback approximation if terrain is unavailable.
     */

    return {

        landFraction:
            1,

        altitudeM:
            0,

        maritime:
            0.45,

        continental:
            0.55,

        distanceToSeaKm:
            300,

        distanceToLandKm:
            0
    };
}


/* ============================================================================
   CLIMATE COMPOSITION
============================================================================ */

function getClimate(
    latInput,
    lonInput,
    options = {}
) {

    const lat = U.clamp(

        finite(
            latInput,
            50
        ),

        C.bounds.south,

        C.bounds.north
    );


    const lon = U.clamp(

        finite(
            lonInput,
            10
        ),

        C.bounds.west,

        C.bounds.east
    );


    const raw = (
        broadClimateWeights(
            lat,
            lon
        )
    );


    const terrain = (
        terrainSample(
            lat,
            lon,
            options
        )
    );


    const local = (
        localModifierBlend(
            lat,
            lon
        )
    );


    /* ========================================================================
       TERRAIN MODULATION
       ======================================================================== */

    if (
        terrain.landFraction <
        0.5
    ) {

        raw["Atlantic"] += (
            0.20 *
            terrain.maritime
        );


        raw["Polar Maritime"] += (

            0.12 *

            U.smoothstep(
                50,
                70,
                lat
            )
        );
    }


    if (
        terrain.continental >
        0
    ) {

        raw["Eurasian Continental"] += (

            terrain.continental *
            0.32
        );


        raw["Central / Eastern European"] += (

            terrain.continental *
            0.18
        );
    }


    if (
        terrain.maritime >
        0
    ) {

        raw["Atlantic"] += (

            terrain.maritime *
            0.18
        );
    }


    const weights = (
        normalize(
            raw
        )
    );


    return {

        lat,

        lon,

        weights,

        rawWeights:
            raw,

        terrain,

        localModifier:
            local
    };
}


/* ============================================================================
   CLIMATE INDICES

   THESE ARE REQUIRED BY europacraft-atmosphere.js
============================================================================ */

function getIndices(
    latInput,
    lonInput,
    options = {}
) {

    const climate = (
        getClimate(
            latInput,
            lonInput,
            options
        )
    );


    const w = (
        climate.weights
    );


    const terrain = (
        climate.terrain
    );


    const local = (
        climate.localModifier
    );


    const percent = type => (

        finite(
            w[type],
            0
        ) /
        100
    );


    /* ========================================================================
       MARITIME
       ======================================================================== */

    let maritime = (

        terrain.maritime *
        0.55 +

        percent(
            "Atlantic"
        ) *
        0.30 +

        percent(
            "Polar Maritime"
        ) *
        0.26 +

        percent(
            "Arctic Maritime"
        ) *
        0.18 +

        percent(
            "North Sea"
        ) *
        0.35 +

        percent(
            "Baltic Maritime"
        ) *
        0.22 +

        percent(
            "Mediterranean"
        ) *
        0.20 +

        percent(
            "Black Sea"
        ) *
        0.16 +

        percent(
            "Caspian Maritime"
        ) *
        0.10 +

        local.maritimeAdjustment
    );


    maritime = clamp01(
        maritime
    );


    /* ========================================================================
       CONTINENTAL
       ======================================================================== */

    let continental = (

        terrain.continental *
        0.55 +

        percent(
            "Eurasian Continental"
        ) *
        0.42 +

        percent(
            "Central / Eastern European"
        ) *
        0.24 +

        percent(
            "Scandinavian Interior"
        ) *
        0.32 +

        percent(
            "Iberian Interior"
        ) *
        0.32 +

        percent(
            "Balkan Modified"
        ) *
        0.16 +

        percent(
            "Anatolian Interior"
        ) *
        0.38 +

        local.continentalAdjustment
    );


    continental = clamp01(
        continental
    );


    const atlantic = clamp01(

        percent(
            "Atlantic"
        ) +

        percent(
            "Polar Maritime"
        ) *
        0.70 +

        percent(
            "North Sea"
        ) *
        0.38
    );


    const baltic = clamp01(

        percent(
            "Baltic Maritime"
        ) +

        percent(
            "North Sea"
        ) *
        0.10
    );


    const arctic = clamp01(

        percent(
            "Arctic Maritime"
        ) +

        percent(
            "Greenland Ice-Sheet"
        ) +

        percent(
            "Polar Maritime"
        ) *
        0.30 +

        percent(
            "Scandinavian Interior"
        ) *
        0.25
    );


    const mediterranean = clamp01(

        percent(
            "Mediterranean"
        ) +

        percent(
            "Balkan Modified"
        ) *
        0.18 +

        percent(
            "Black Sea"
        ) *
        0.10
    );


    const dryInterior = clamp01(

        percent(
            "Iberian Interior"
        ) *
        0.70 +

        percent(
            "Anatolian Interior"
        ) *
        0.80 +

        percent(
            "North African"
        ) *
        0.80 +

        percent(
            "Eurasian Continental"
        ) *
        0.25
    );


    const northSea = clamp01(

        percent(
            "North Sea"
        )
    );


    const blackSea = clamp01(

        percent(
            "Black Sea"
        )
    );


    const scandinavianInterior = clamp01(

        percent(
            "Scandinavian Interior"
        )
    );


    const westCentral = clamp01(

        percent(
            "West-Central European"
        )
    );


    const eastCentral = clamp01(

        percent(
            "Central / Eastern European"
        )
    );


    const balkan = clamp01(

        percent(
            "Balkan Modified"
        )
    );


    const anatolian = clamp01(

        percent(
            "Anatolian Interior"
        )
    );


    /*
     * IMPORTANT:
     *
     * This object is ALWAYS returned.
     *
     * atmosphere.js can therefore safely read:
     *
     *     indices.maritime
     *     indices.atlantic
     *     indices.baltic
     *     indices.continental
     *     indices.dryInterior
     *     indices.arctic
     *     indices.mediterranean
     */

    return {

        maritime,

        continental,

        atlantic,

        baltic,

        arctic,

        mediterranean,

        dryInterior,

        northSea,

        blackSea,

        scandinavianInterior,

        westCentral,

        eastCentral,

        balkan,

        anatolian,

        landFraction:
            terrain.landFraction,

        altitudeM:
            terrain.altitudeM,

        distanceToSeaKm:
            terrain.distanceToSeaKm
    };
}


/* ============================================================================
   SEASONAL TEMPERATURE
============================================================================ */

function seasonalTemperatureComponent(
    lat,
    indices,
    dayOfYear
) {

    const config = (
        C.climate
    );


    const amplitudeBase = finite(

        config.seasonalAmplitudeC,

        11.5
    );


    /*
     * Continental areas receive larger seasonal range.
     * Maritime areas receive smaller seasonal range.
     */

    const maritimeReduction = finite(

        config.maritime &&
        config.maritime.seasonalAmplitudeReduction,

        0.48
    );


    const continentalBoost = finite(

        config.continental &&
        config.continental.seasonalAmplitudeBoost,

        0.72
    );


    let amplitude = (

        amplitudeBase *
        (
            1 -

            indices.maritime *
            maritimeReduction +

            indices.continental *
            continentalBoost
        )
    );


    /*
     * Northern Europe naturally has larger seasonal solar range.
     */

    amplitude *= U.lerp(

        0.70,

        1.25,

        U.smoothstep(
            32,
            70,
            lat
        )
    );


    amplitude = U.clamp(

        amplitude,

        3.5,

        24
    );


    const warmPeakDay = finite(

        config.seasonalWarmPeakDay,

        205
    );


    /*
     * cosine = +1 at warm seasonal peak
     */

    const phase = (

        2 *
        Math.PI *

        (
            dayOfYear -
            warmPeakDay
        ) /

        365.2422
    );


    return (

        amplitude *
        Math.cos(
            phase
        )
    );
}


/* ============================================================================
   ANNUAL-MEAN TEMPERATURE
============================================================================ */

function annualMeanTemperature(
    lat,
    lon,
    indices,
    terrain,
    localModifier
) {

    const config = (
        C.climate
    );


    /*
     * Reference around 45°N.
     */

    let temperature = (

        13.5 -

        (
            lat -
            45
        ) *

        finite(
            config.latitudeCoolingCPerDegree,
            0.52
        )
    );


    /* ========================================================================
       ATLANTIC MODERATION
       ======================================================================== */

    temperature += (

        indices.atlantic *
        1.0
    );


    /* ========================================================================
       MEDITERRANEAN WARMTH
       ======================================================================== */

    temperature += (

        indices.mediterranean *
        2.2
    );


    /* ========================================================================
       ARCTIC COOLING
       ======================================================================== */

    temperature -= (

        indices.arctic *
        3.3
    );


    /* ========================================================================
       DRY INTERIOR
       ======================================================================== */

    temperature += (

        indices.dryInterior *
        0.3
    );


    /* ========================================================================
       ALTITUDE
       ======================================================================== */

    temperature -= (

        terrain.altitudeM /
        1000 *

        finite(
            config.lapseRateCPerKm,
            6.5
        )
    );


    /* ========================================================================
       LOCAL GEOGRAPHICAL REFINEMENT
       ======================================================================== */

    temperature += (
        localModifier.temperatureOffsetC
    );


    temperature += finite(

        config.globalTemperatureOffsetC,

        0
    );


    return temperature;
}


/* ============================================================================
   DIURNAL RANGE
============================================================================ */

function climatologicalDiurnalRange(
    indices
) {

    const diurnal = (

        C.climate &&
        C.climate.diurnal

            ? C.climate.diurnal

            : {}
    );


    const maritimeRange = finite(

        diurnal.maritimeRangeC,

        4.5
    );


    const inlandRange = finite(

        diurnal.inlandRangeC,

        10.5
    );


    const dryInteriorRange = finite(

        diurnal.dryInteriorRangeC,

        14
    );


    let range = U.lerp(

        maritimeRange,

        inlandRange,

        indices.continental
    );


    range = U.lerp(

        range,

        dryInteriorRange,

        indices.dryInterior
    );


    /*
     * Strong Atlantic influence suppresses the normal range further.
     */

    range *= (

        1 -

        indices.atlantic *
        0.12
    );


    return U.clamp(

        range,

        2.5,

        17
    );
}


/* ============================================================================
   HOURLY CLIMATOLOGY

   This is important because temperature anomaly must be based against
   climatology for the exact hour, not against monthly mean temperature.
============================================================================ */

function hourlyTemperatureFromMean(
    meanC,
    diurnalRangeC,
    lat,
    lon,
    date
) {

    const utcHour = (
        U.fractionalHourUTC(
            date
        )
    );


    /*
     * Approximate local solar time.
     */

    const localSolarHour = (

        utcHour +
        lon /
        15
    );


    /*
     * Typical climatological maximum ~15:00 local solar time.
     * Minimum occurs near dawn.
     */

    const phase = (

        2 *
        Math.PI *

        (
            localSolarHour -
            15
        ) /

        24
    );


    const halfRange = (

        diurnalRangeC /
        2
    );


    return (

        meanC +

        halfRange *
        Math.cos(
            phase
        )
    );
}


/* ============================================================================
   BASELINE TEMPERATURE

   REQUIRED BY ATMOSPHERE.JS
============================================================================ */

function getBaselineTemperature(
    latInput,
    lonInput,
    dateInput,
    options = {}
) {

    const date = (

        dateInput instanceof Date

            ? dateInput

            : new Date(
                dateInput
            )
    );


    const lat = U.clamp(

        finite(
            latInput,
            50
        ),

        C.bounds.south,

        C.bounds.north
    );


    const lon = U.clamp(

        finite(
            lonInput,
            10
        ),

        C.bounds.west,

        C.bounds.east
    );


    const climate = (
        getClimate(
            lat,
            lon,
            options
        )
    );


    const indices = (
        getIndices(
            lat,
            lon,
            options
        )
    );


    const doy = (
        U.dayOfYearUTC(
            date
        )
    );


    const terrain = (
        climate.terrain
    );


    const annualMean = (
        annualMeanTemperature(

            lat,

            lon,

            indices,

            terrain,

            climate.localModifier
        )
    );


    const seasonal = (
        seasonalTemperatureComponent(

            lat,

            indices,

            doy
        )
    );


    const meanC = (

        annualMean +
        seasonal
    );


    const diurnalRangeC = (
        climatologicalDiurnalRange(
            indices
        )
    );


    const highC = (

        meanC +
        diurnalRangeC /
        2
    );


    const lowC = (

        meanC -
        diurnalRangeC /
        2
    );


    const hourlyC = (
        hourlyTemperatureFromMean(

            meanC,

            diurnalRangeC,

            lat,

            lon,

            date
        )
    );


    /*
     * IMPORTANT:
     *
     * indices is explicitly included here.
     *
     * This fixes the startup error where atmosphere.js expected:
     *
     *     baseline.indices.maritime
     *
     * but received undefined.
     */

    return {

        meanC,

        hourlyC,

        highC,

        lowC,

        diurnalRangeC,

        annualMeanC:
            annualMean,

        seasonalComponentC:
            seasonal,

        indices,

        climate
    };
}


/* ============================================================================
   EXPORT
============================================================================ */

global.EuropaClimate = Object.freeze({

    version:
        "7.3-modular-compatible",

    bounds:
        Object.freeze({

            west:
                C.bounds.west,

            east:
                C.bounds.east,

            south:
                C.bounds.south,

            north:
                C.bounds.north
        }),

    types:
        Object.freeze(
            TYPES.slice()
        ),

    normalize,

    getClimate,

    getIndices,

    getBaselineTemperature
});

})(window);
