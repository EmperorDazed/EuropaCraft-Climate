/* ============================================================================
   EuropaCraft Weather Simulator
   Central Configuration
   Version 7.2

   FILE:
       config.js

   PURPOSE

   This is the main editable configuration file for the EuropaCraft climate
   and weather simulator.

   Routine tuning should be done HERE rather than inside the physics modules.

   STANDARD PHYSICS TIMESTEP:
       4 simulated minutes

============================================================================ */

(function (global) {
"use strict";


const CONFIG = {

    version:
        "7.2-europacraft-weather",


    /* ========================================================================
       MAP BOUNDS
       ======================================================================== */

    bounds: {

        west:
            -26,

        east:
            52,

        south:
            30,

        north:
            74
    },


    /* ========================================================================
       MODEL GRID
       ======================================================================== */

    grid: {

        /*
         * Persistent atmosphere grid.
         */

        nx:
            195,

        ny:
            110,


        /*
         * STANDARD EUROPAcraft PHYSICS STEP

         * 4 minutes is the normal simulation timestep.

         * The physics engine is timestep-aware, so this may later be changed
         * to 1 minute for a higher-detail mode without rewriting the model.
         */

        physicsStepMinutes:
            4,


        maxWindMs:
            52,


        minPressureHpa:
            935,

        maxPressureHpa:
            1065
    },


    /* ========================================================================
       TERRAIN
       ======================================================================== */

    terrain: {

        coastInfluenceKm:
            450,

        coastSoftness:
            0.16,


        lowlandBaseM:
            65,

        maxAltitudeM:
            3600,


        roughnessAmplitudeM:
            85,

        roughnessScale:
            0.085,


        mountains: [

            {
                name:
                    "Alps",

                lat:
                    46.4,

                lon:
                    10.4,

                sigmaLat:
                    1.25,

                sigmaLon:
                    3.8,

                heightM:
                    2700
            },

            {
                name:
                    "Pyrenees",

                lat:
                    42.65,

                lon:
                    0.6,

                sigmaLat:
                    0.75,

                sigmaLon:
                    2.9,

                heightM:
                    2350
            },

            {
                name:
                    "Carpathians",

                lat:
                    47.5,

                lon:
                    24.0,

                sigmaLat:
                    1.7,

                sigmaLon:
                    4.4,

                heightM:
                    1800
            },

            {
                name:
                    "Dinaric Alps",

                lat:
                    44.2,

                lon:
                    17.4,

                sigmaLat:
                    2.0,

                sigmaLon:
                    1.6,

                heightM:
                    1500
            },

            {
                name:
                    "Balkan Mountains",

                lat:
                    42.8,

                lon:
                    24.7,

                sigmaLat:
                    1.1,

                sigmaLon:
                    2.8,

                heightM:
                    1350
            },

            {
                name:
                    "Scandinavian Mountains",

                lat:
                    64.0,

                lon:
                    12.5,

                sigmaLat:
                    5.5,

                sigmaLon:
                    2.1,

                heightM:
                    1750
            },

            {
                name:
                    "Scottish Highlands",

                lat:
                    57.2,

                lon:
                    -4.5,

                sigmaLat:
                    1.3,

                sigmaLon:
                    1.7,

                heightM:
                    850
            },

            {
                name:
                    "Iberian Plateau",

                lat:
                    40.5,

                lon:
                    -4.2,

                sigmaLat:
                    2.7,

                sigmaLon:
                    4.0,

                heightM:
                    650
            },

            {
                name:
                    "Anatolian Plateau",

                lat:
                    39.0,

                lon:
                    32.5,

                sigmaLat:
                    2.6,

                sigmaLon:
                    5.8,

                heightM:
                    1050
            },

            {
                name:
                    "Apennines",

                lat:
                    42.6,

                lon:
                    13.0,

                sigmaLat:
                    2.8,

                sigmaLon:
                    1.0,

                heightM:
                    1300
            },

            {
                name:
                    "Caucasus West",

                lat:
                    42.5,

                lon:
                    43.0,

                sigmaLat:
                    1.0,

                sigmaLon:
                    3.3,

                heightM:
                    2850
            }
        ]
    },


    /* ========================================================================
       CLIMATE NORMALS

       These influence climatological normals and initialization.

       They do NOT directly generate weather anomalies.
       ======================================================================== */

    climate: {

        globalTemperatureOffsetC:
            0,


        latitudeCoolingCPerDegree:
            0.52,


        lapseRateCPerKm:
            6.5,


        seasonalAmplitudeC:
            11.5,


        seasonalWarmPeakDay:
            205,

        seasonalColdPeakDay:
            20,


        maritime: {

            seasonalAmplitudeReduction:
                0.48,

            diurnalRangeReduction:
                0.55
        },


        continental: {

            seasonalAmplitudeBoost:
                0.72,

            diurnalRangeBoost:
                0.65
        },


        diurnal: {

            maritimeRangeC:
                4.5,

            inlandRangeC:
                10.5,

            dryInteriorRangeC:
                14.0
        },


        types: [

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
        ],


        /* ====================================================================
           BROAD CLIMATE ANCHORS

           These are geographical bias/control points.

           They should not behave as isolated circular weather systems.
           ==================================================================== */

        anchors: [

            {
                name:
                    "North Atlantic",

                lat:
                    55,

                lon:
                    -18,

                radiusKm:
                    1800,

                type:
                    "Atlantic",

                strength:
                    1.0
            },

            {
                name:
                    "Icelandic Atlantic",

                lat:
                    64.5,

                lon:
                    -20,

                radiusKm:
                    950,

                type:
                    "Polar Maritime",

                strength:
                    0.85
            },

            {
                name:
                    "Arctic Maritime",

                lat:
                    72,

                lon:
                    15,

                radiusKm:
                    1300,

                type:
                    "Arctic Maritime",

                strength:
                    0.90
            },

            {
                name:
                    "North Sea",

                lat:
                    56,

                lon:
                    3,

                radiusKm:
                    850,

                type:
                    "North Sea",

                strength:
                    0.95
            },

            {
                name:
                    "Baltic",

                lat:
                    58,

                lon:
                    20,

                radiusKm:
                    850,

                type:
                    "Baltic Maritime",

                strength:
                    0.90
            },

            {
                name:
                    "Mediterranean",

                lat:
                    38,

                lon:
                    15,

                radiusKm:
                    1800,

                type:
                    "Mediterranean",

                strength:
                    1.0
            },

            {
                name:
                    "Black Sea",

                lat:
                    43,

                lon:
                    33,

                radiusKm:
                    800,

                type:
                    "Black Sea",

                strength:
                    0.95
            },

            {
                name:
                    "Eastern Continental",

                lat:
                    55,

                lon:
                    38,

                radiusKm:
                    1800,

                type:
                    "Eurasian Continental",

                strength:
                    1.0
            },

            {
                name:
                    "Iberian Interior",

                lat:
                    40,

                lon:
                    -4,

                radiusKm:
                    850,

                type:
                    "Iberian Interior",

                strength:
                    0.95
            },

            {
                name:
                    "Central Europe",

                lat:
                    50,

                lon:
                    12,

                radiusKm:
                    1250,

                type:
                    "West-Central European",

                strength:
                    0.90
            },

            {
                name:
                    "Eastern Europe",

                lat:
                    51,

                lon:
                    25,

                radiusKm:
                    1300,

                type:
                    "Central / Eastern European",

                strength:
                    0.95
            },

            {
                name:
                    "Scandinavian Interior",

                lat:
                    63,

                lon:
                    17,

                radiusKm:
                    1000,

                type:
                    "Scandinavian Interior",

                strength:
                    1.0
            },

            {
                name:
                    "Balkans",

                lat:
                    43,

                lon:
                    21,

                radiusKm:
                    1000,

                type:
                    "Balkan Modified",

                strength:
                    0.95
            },

            {
                name:
                    "Anatolian Interior",

                lat:
                    39,

                lon:
                    33,

                radiusKm:
                    950,

                type:
                    "Anatolian Interior",

                strength:
                    1.0
            }
        ],


        /* ====================================================================
           LOCAL SUBREGIONAL REFINEMENT

           These are used by climate-v3 to avoid broad-region stretching.
           ==================================================================== */

        localModifiers: [

            {
                name:
                    "Western Norway",

                lat:
                    61.5,

                lon:
                    6.0,

                radiusKm:
                    520,

                temperatureOffsetC:
                    1.0,

                maritimeBoost:
                    0.32,

                continentalBoost:
                    -0.25
            },

            {
                name:
                    "Scandinavian Interior",

                lat:
                    63.0,

                lon:
                    16.0,

                radiusKm:
                    700,

                temperatureOffsetC:
                    -1.1,

                maritimeBoost:
                    -0.18,

                continentalBoost:
                    0.30
            },

            {
                name:
                    "Western Britain and Ireland",

                lat:
                    53.5,

                lon:
                    -6.0,

                radiusKm:
                    650,

                temperatureOffsetC:
                    0.5,

                maritimeBoost:
                    0.30,

                continentalBoost:
                    -0.24
            },

            {
                name:
                    "Eastern England",

                lat:
                    52.5,

                lon:
                    0.5,

                radiusKm:
                    420,

                temperatureOffsetC:
                    -0.1,

                maritimeBoost:
                    -0.08,

                continentalBoost:
                    0.14
            },

            {
                name:
                    "Scotland",

                lat:
                    57.0,

                lon:
                    -4.0,

                radiusKm:
                    480,

                temperatureOffsetC:
                    -1.0,

                maritimeBoost:
                    0.12,

                continentalBoost:
                    -0.05
            },

            {
                name:
                    "Brittany",

                lat:
                    48.2,

                lon:
                    -3.0,

                radiusKm:
                    380,

                temperatureOffsetC:
                    0.1,

                maritimeBoost:
                    0.28,

                continentalBoost:
                    -0.22
            },

            {
                name:
                    "Central France",

                lat:
                    47.0,

                lon:
                    2.5,

                radiusKm:
                    600,

                temperatureOffsetC:
                    0,

                maritimeBoost:
                    -0.08,

                continentalBoost:
                    0.10
            },

            {
                name:
                    "Provence",

                lat:
                    43.8,

                lon:
                    5.5,

                radiusKm:
                    350,

                temperatureOffsetC:
                    1.2,

                maritimeBoost:
                    0.14,

                continentalBoost:
                    -0.12
            },

            {
                name:
                    "Galicia",

                lat:
                    42.8,

                lon:
                    -8.0,

                radiusKm:
                    380,

                temperatureOffsetC:
                    0.2,

                maritimeBoost:
                    0.34,

                continentalBoost:
                    -0.26
            },

            {
                name:
                    "Castile",

                lat:
                    40.7,

                lon:
                    -4.0,

                radiusKm:
                    600,

                temperatureOffsetC:
                    0,

                maritimeBoost:
                    -0.20,

                continentalBoost:
                    0.34
            },

            {
                name:
                    "Mediterranean Spain",

                lat:
                    39.0,

                lon:
                    -0.5,

                radiusKm:
                    500,

                temperatureOffsetC:
                    1.1,

                maritimeBoost:
                    0.20,

                continentalBoost:
                    -0.13
            },

            {
                name:
                    "Po Valley",

                lat:
                    45.2,

                lon:
                    10.0,

                radiusKm:
                    450,

                temperatureOffsetC:
                    -0.2,

                maritimeBoost:
                    -0.12,

                continentalBoost:
                    0.23
            },

            {
                name:
                    "Southern Italy",

                lat:
                    40.0,

                lon:
                    16.0,

                radiusKm:
                    650,

                temperatureOffsetC:
                    1.5,

                maritimeBoost:
                    0.24,

                continentalBoost:
                    -0.18
            },

            {
                name:
                    "Slovenia",

                lat:
                    46.1,

                lon:
                    14.7,

                radiusKm:
                    260,

                temperatureOffsetC:
                    -0.3,

                maritimeBoost:
                    0.02,

                continentalBoost:
                    0.13
            },

            {
                name:
                    "Zagreb Interior Croatia",

                lat:
                    45.8,

                lon:
                    16.0,

                radiusKm:
                    300,

                temperatureOffsetC:
                    -0.2,

                maritimeBoost:
                    -0.12,

                continentalBoost:
                    0.30
            },

            {
                name:
                    "Dalmatia",

                lat:
                    43.7,

                lon:
                    16.3,

                radiusKm:
                    420,

                temperatureOffsetC:
                    1.6,

                maritimeBoost:
                    0.34,

                continentalBoost:
                    -0.28
            },

            {
                name:
                    "Transylvania",

                lat:
                    46.5,

                lon:
                    24.5,

                radiusKm:
                    430,

                temperatureOffsetC:
                    -0.6,

                maritimeBoost:
                    -0.16,

                continentalBoost:
                    0.35
            },

            {
                name:
                    "Wallachia",

                lat:
                    44.6,

                lon:
                    25.0,

                radiusKm:
                    430,

                temperatureOffsetC:
                    0.2,

                maritimeBoost:
                    -0.07,

                continentalBoost:
                    0.26
            },

            {
                name:
                    "Pomerania",

                lat:
                    54.1,

                lon:
                    16.2,

                radiusKm:
                    400,

                temperatureOffsetC:
                    0,

                maritimeBoost:
                    0.18,

                continentalBoost:
                    -0.10
            },

            {
                name:
                    "Greater Poland",

                lat:
                    52.2,

                lon:
                    17.0,

                radiusKm:
                    430,

                temperatureOffsetC:
                    0,

                maritimeBoost:
                    -0.08,

                continentalBoost:
                    0.19
            },

            {
                name:
                    "Masovia",

                lat:
                    52.3,

                lon:
                    21.0,

                radiusKm:
                    420,

                temperatureOffsetC:
                    -0.1,

                maritimeBoost:
                    -0.13,

                continentalBoost:
                    0.26
            },

            {
                name:
                    "Ukraine Interior",

                lat:
                    49.0,

                lon:
                    31.0,

                radiusKm:
                    800,

                temperatureOffsetC:
                    -0.3,

                maritimeBoost:
                    -0.22,

                continentalBoost:
                    0.38
            },

            {
                name:
                    "Crimea Black Sea Coast",

                lat:
                    44.8,

                lon:
                    34.0,

                radiusKm:
                    330,

                temperatureOffsetC:
                    1.0,

                maritimeBoost:
                    0.25,

                continentalBoost:
                    -0.18
            },

            {
                name:
                    "Central Anatolia",

                lat:
                    39.0,

                lon:
                    33.0,

                radiusKm:
                    700,

                temperatureOffsetC:
                    -0.4,

                maritimeBoost:
                    -0.26,

                continentalBoost:
                    0.40
            },

            {
                name:
                    "Aegean Turkey",

                lat:
                    38.5,

                lon:
                    27.0,

                radiusKm:
                    400,

                temperatureOffsetC:
                    1.3,

                maritimeBoost:
                    0.28,

                continentalBoost:
                    -0.24
            }
        ]
    },


    /* ========================================================================
       OCEAN
       ======================================================================== */

    ocean: {

        heatCapacityFactor:
            0.035,


        airSeaHeatExchange:
            0.020,


        evaporationFactor:
            0.010,


        windExchangeBoost:
            0.065,


        seasonalRelaxation:
            0.0015,


        oceanMixingPerHour:
            0.005,


        minSstC:
            -2,

        maxSstC:
            31
    },


    /* ========================================================================
       ATMOSPHERE
       ======================================================================== */

    atmosphere: {

        /*
         * Surface drag is expressed as an hourly fractional tendency.
         */

        surfaceDragLand:
            0.055,

        surfaceDragSea:
            0.020,


        /*
         * Boundary-layer mixing.
         */

        mixingRateLand:
            0.055,

        mixingRateSea:
            0.040,


        /*
         * Weak numerical diffusion.

         * These should remain low; fronts should not be smeared away.
         */

        temperatureDiffusion:
            0.018,

        moistureDiffusion:
            0.014,


        /*
         * Numerical wind damping.
         */

        windRelaxation:
            0.12
    },


    /* ========================================================================
       MOISTURE
       ======================================================================== */

    moisture: {

        condensationRate:
            0.70,


        evaporationRate:
            0.22,


        cloudFormationRh:
            0.78,


        cloudSaturationRh:
            0.96,


        maximumSpecificHumidity:
            0.045
    },


    /* ========================================================================
       RADIATION
       ======================================================================== */

    radiation: {

        solarHeatingStrength:
            1.0,


        clearSkyNightCooling:
            1.0,


        cloudShortwaveReduction:
            0.68,


        cloudLongwaveRetention:
            0.76,


        humidityLongwaveRetention:
            0.20,


        snowAlbedo:
            0.72,


        normalGroundAlbedo:
            0.20
    },


    /* ========================================================================
       PRECIPITATION PHASE

       Minecraft-compatible thresholds.
       ======================================================================== */

    precipitationPhase: {

        snowMaxC:
            1.5,

        sleetMaxC:
            3.0
    },


    /* ========================================================================
       SNOW
       ======================================================================== */

    snow: {

        accumulationEfficiency:
            1.0,


        minimumPersistentDepthCm:
            0.05,


        liquidToSnowRatio:
            10,


        meltTemperatureC:
            0.0,


        groundInsulationStrength:
            0.70
    },


    /* ========================================================================
       SYNOPTIC / USER FORCING
       ======================================================================== */

    forcing: {

        maxArrows:
            12,


        defaultWidthKm:
            600,


        defaultSpeedKmh:
            40,


        maxSpeedKmh:
            140,


        defaultStrength:
            0.75,


        arrowFalloffPower:
            2.0
    },


    /* ========================================================================
       HISTORY

       Physics itself runs every FOUR minutes.

       Weather stations keep each real 4-minute observation.

       UI may interpolate between those observations for arbitrary displayed
       minutes.

       Full atmosphere snapshots are saved hourly for timeline rewinding.
       ======================================================================== */

    history: {

        snapshotEveryMinutes:
            60,


        snapshotRetentionDays:
            35,


        stationSampleEveryMinutes:
            4,


        stationRetentionDays:
            90
    },


    /* ========================================================================
       DISPLAY DEFAULTS

       Renderer may override these independently.
       ======================================================================== */

    display: {

        width:
            780,

        height:
            440,


        defaultLayer:
            "temperature",


        isobars:
            true,


        isobarIntervalHpa:
            4,


        windVectors:
            false,


        frontOverlay:
            false
    }
};


/* ============================================================================
   EXPORT
============================================================================ */

global.EuropaConfig = Object.freeze(
    CONFIG
);

})(window);
