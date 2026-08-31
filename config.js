/* ============================================================================
   EuropaCraft Weather Simulator
   USER-EDITABLE MASTER CONFIGURATION
   Version: 7.1
   ============================================================================

   THIS IS THE FILE YOU SHOULD EDIT FIRST.

   Most ordinary climate and terrain tuning should be possible from here
   without opening the physics files.

   Major editable areas:

   1. MAP
      - Geographic bounds
      - Grid resolution

   2. TERRAIN
      - Land/sea smoothing
      - Mountain ranges
      - Regional terrain features

   3. CLIMATE
      - Maritime strength
      - Continentality
      - Seasonal lag
      - Climate-region anchors
      - Local modifiers

   4. ATMOSPHERE
      - Mixing
      - Pressure
      - Wind limits

   5. OCEAN
      - SST response
      - Air-sea heat transfer

   6. MOISTURE
      - Evaporation
      - Condensation
      - Clouds
      - Precipitation

   7. RADIATION
      - Day/night heating and cooling

   8. SNOW
      - Snow/rain/sleet thresholds
      - Snow accumulation and melting
============================================================================ */

(function (global) {
"use strict";

const CONFIG = {

    version: "7.1-configurable-geography",

    /* ========================================================================
       MAP
       ======================================================================== */

    bounds: {
        west: -26,
        east: 52,
        south: 30,
        north: 74
    },

    grid: {
        /*
         * Physics grid.
         *
         * 195 × 110 is deliberately much smaller than the rendered map.
         * The renderer interpolates it smoothly.
         *
         * Increasing these values improves local detail but increases CPU use.
         */
        nx: 195,
        ny: 110,

        physicsStepMinutes: 10,

        maxWindMs: 52,

        minPressureHpa: 930,
        maxPressureHpa: 1060
    },


    /* ========================================================================
       TERRAIN
       ======================================================================== */

    terrain: {

        /*
         * Controls how far coastlines affect nearby inland cells.
         *
         * This is NOT the atmospheric maritime influence itself.
         * It is only a static geographic coastal-distance field.
         */
        coastInfluenceKm: 450,

        /*
         * Rough land/sea transition softness.
         * 0 = sharp
         * higher values = smoother coastal interpolation
         */
        coastSoftness: 0.16,

        /*
         * Background altitude used for ordinary lowland terrain.
         */
        lowlandBaseM: 65,

        /*
         * Maximum permitted generated terrain altitude.
         */
        maxAltitudeM: 3600,

        /*
         * Terrain roughness controls.
         *
         * These are subtle deterministic variations, NOT visual random noise.
         */
        roughness: {
            enabled: true,
            amplitudeM: 45,
            scaleDegrees: 1.8
        },

        /*
         * Mountain ranges.
         *
         * centerLat / centerLon = middle
         * radiusLat / radiusLon = spread
         * heightM = central terrain addition
         *
         * These are broad terrain fields rather than exact DEM data.
         */
        mountains: [

            {
                name: "Alps",
                centerLat: 46.6,
                centerLon: 10.3,
                radiusLat: 2.1,
                radiusLon: 5.4,
                heightM: 2350
            },

            {
                name: "Pyrenees",
                centerLat: 42.7,
                centerLon: 0.2,
                radiusLat: 1.35,
                radiusLon: 4.4,
                heightM: 1900
            },

            {
                name: "Carpathians",
                centerLat: 47.3,
                centerLon: 24.3,
                radiusLat: 2.5,
                radiusLon: 6.4,
                heightM: 1450
            },

            {
                name: "Dinaric Alps",
                centerLat: 44.0,
                centerLon: 17.2,
                radiusLat: 3.3,
                radiusLon: 3.1,
                heightM: 1300
            },

            {
                name: "Balkan Mountains",
                centerLat: 42.7,
                centerLon: 24.4,
                radiusLat: 2.0,
                radiusLon: 4.5,
                heightM: 1150
            },

            {
                name: "Scandinavian Mountains",
                centerLat: 63.2,
                centerLon: 8.0,
                radiusLat: 8.7,
                radiusLon: 3.0,
                heightM: 1450
            },

            {
                name: "Scottish Highlands",
                centerLat: 57.0,
                centerLon: -4.5,
                radiusLat: 2.4,
                radiusLon: 2.8,
                heightM: 650
            },

            {
                name: "Iberian Plateau",
                centerLat: 40.3,
                centerLon: -3.8,
                radiusLat: 4.0,
                radiusLon: 5.0,
                heightM: 620
            },

            {
                name: "Anatolian Plateau",
                centerLat: 39.2,
                centerLon: 33.2,
                radiusLat: 4.3,
                radiusLon: 8.5,
                heightM: 930
            },

            {
                name: "Apennines",
                centerLat: 42.2,
                centerLon: 13.0,
                radiusLat: 5.1,
                radiusLon: 1.6,
                heightM: 1050
            },

            {
                name: "Caucasus West",
                centerLat: 43.2,
                centerLon: 40.5,
                radiusLat: 1.5,
                radiusLon: 5.0,
                heightM: 2350
            }
        ]
    },


    /* ========================================================================
       CLIMATE
       ======================================================================== */

    climate: {

        /*
         * Global climate tuning.
         */

        globalTemperatureOffsetC: 0,

        /*
         * Latitude cooling.
         *
         * Increase to make northern Europe colder relative to the south.
         */
        latitudeCoolingCPerDegree: 0.43,

        latitudeReference: 35,

        /*
         * Standard environmental lapse rate.
         */
        lapseRateCPerKm: 6.1,

        /*
         * Seasonal amplitude.
         *
         * Northern and continental areas automatically receive larger
         * seasonal ranges.
         */
        seasonalAmplitudeBaseC: 7.2,

        seasonalAmplitudeLatitudeFactor: 0.17,

        seasonalAmplitudeContinentalFactor: 8.5,

        /*
         * Seasonal thermal lag.
         *
         * Approximate day of warmest annual temperature.
         *
         * 205 = late July
         * 220 = early/mid August
         */
        landSeasonalPeakDay: 205,
        seaSeasonalPeakDay: 225,

        /*
         * Maritime influence.
         *
         * THIS IS ONE OF THE MOST IMPORTANT TUNING SECTIONS.
         */

        maritime: {

            /*
             * Maximum static geographic maritime influence near sea.
             */
            maximum: 1.0,

            /*
             * Distance over which strong oceanic moderation penetrates inland.
             */
            penetrationKm: 600,

            /*
             * How rapidly it falls away inland.
             * Higher = sharper coast/interior transition.
             */
            falloffPower: 1.35,

            /*
             * Static reduction in annual temperature range.
             *
             * Dynamic weather still performs real air-sea modification.
             */
            seasonalRangeReductionC: 6.5,

            /*
             * Static reduction in day/night temperature range.
             */
            diurnalRangeReductionC: 4.0
        },

        /*
         * Continentality.
         */

        continental: {

            inlandStrength: 1.0,

            seasonalRangeAdditionC: 7.5,

            diurnalRangeAdditionC: 3.5,

            winterCoolingC: 2.0,

            summerHeatingC: 1.3
        },

        /*
         * Diurnal temperature range.
         */

        diurnal: {
            maritimeC: 4.5,
            mixedC: 7.5,
            continentalC: 11.0,
            aridInteriorC: 14.0
        },

        /*
         * Climate influence types.
         *
         * Keep these names stable because other files can refer to them.
         */

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

        /*
         * Broad climate source anchors.
         *
         * strength:
         *      General importance.
         *
         * radiusKm:
         *      Geographic spread.
         *
         * weights:
         *      Independent raw climate influences.
         *      THEY DO NOT NEED TO TOTAL 100.
         *
         * The climate engine normalises them afterwards.
         */

        anchors: [

            {
                name: "North Atlantic",
                lat: 54,
                lon: -18,
                radiusKm: 1800,
                strength: 1.0,
                weights: {
                    "Atlantic": 100,
                    "Polar Maritime": 30
                }
            },

            {
                name: "Icelandic Atlantic",
                lat: 64.5,
                lon: -20,
                radiusKm: 1250,
                strength: 1.0,
                weights: {
                    "Atlantic": 70,
                    "Polar Maritime": 80,
                    "Arctic Maritime": 20
                }
            },

            {
                name: "Greenland Sea",
                lat: 72,
                lon: -10,
                radiusKm: 1000,
                strength: 1.0,
                weights: {
                    "Polar Maritime": 65,
                    "Arctic Maritime": 90,
                    "Greenland Ice-Sheet": 20
                }
            },

            {
                name: "Norwegian Sea",
                lat: 66,
                lon: 5,
                radiusKm: 1200,
                strength: 1.0,
                weights: {
                    "Atlantic": 45,
                    "Polar Maritime": 85,
                    "Arctic Maritime": 30
                }
            },

            {
                name: "Barents",
                lat: 72,
                lon: 30,
                radiusKm: 1100,
                strength: 1.0,
                weights: {
                    "Polar Maritime": 50,
                    "Arctic Maritime": 100,
                    "Eurasian Continental": 15
                }
            },

            {
                name: "North Sea",
                lat: 56,
                lon: 3,
                radiusKm: 900,
                strength: 1.15,
                weights: {
                    "North Sea": 100,
                    "Atlantic": 45,
                    "Polar Maritime": 20,
                    "British Landmass": 15
                }
            },

            {
                name: "Baltic",
                lat: 58,
                lon: 19,
                radiusKm: 850,
                strength: 1.1,
                weights: {
                    "Baltic Maritime": 100,
                    "Central / Eastern European": 35,
                    "Scandinavian Interior": 25
                }
            },

            {
                name: "Western Mediterranean",
                lat: 39,
                lon: 5,
                radiusKm: 1200,
                strength: 1.0,
                weights: {
                    "Mediterranean": 100,
                    "North African": 20,
                    "West-Central European": 15
                }
            },

            {
                name: "Central Mediterranean",
                lat: 38,
                lon: 16,
                radiusKm: 1200,
                strength: 1.0,
                weights: {
                    "Mediterranean": 100,
                    "North African": 25,
                    "Balkan Modified": 15
                }
            },

            {
                name: "Eastern Mediterranean",
                lat: 36,
                lon: 28,
                radiusKm: 1250,
                strength: 1.0,
                weights: {
                    "Mediterranean": 90,
                    "North African": 20,
                    "Anatolian Interior": 20,
                    "Balkan Modified": 15
                }
            },

            {
                name: "Black Sea",
                lat: 43,
                lon: 34,
                radiusKm: 850,
                strength: 1.0,
                weights: {
                    "Black Sea": 100,
                    "Central / Eastern European": 35,
                    "Balkan Modified": 15
                }
            },

            {
                name: "Western Russia",
                lat: 56,
                lon: 40,
                radiusKm: 1800,
                strength: 1.05,
                weights: {
                    "Eurasian Continental": 100,
                    "Central / Eastern European": 60
                }
            },

            {
                name: "Central Europe",
                lat: 50,
                lon: 12,
                radiusKm: 1500,
                strength: 1.0,
                weights: {
                    "West-Central European": 100,
                    "Central / Eastern European": 55,
                    "Atlantic": 20
                }
            },

            {
                name: "Balkans",
                lat: 43.5,
                lon: 21,
                radiusKm: 1050,
                strength: 1.0,
                weights: {
                    "Balkan Modified": 100,
                    "Central / Eastern European": 35,
                    "Mediterranean": 25
                }
            },

            {
                name: "Anatolia",
                lat: 39,
                lon: 34,
                radiusKm: 950,
                strength: 1.0,
                weights: {
                    "Anatolian Interior": 100,
                    "Mediterranean": 25,
                    "Eurasian Continental": 20
                }
            },

            {
                name: "Iberian Interior",
                lat: 40,
                lon: -4,
                radiusKm: 850,
                strength: 1.0,
                weights: {
                    "Iberian Interior": 100,
                    "Mediterranean": 35,
                    "Atlantic": 20
                }
            }
        ],

        /*
         * Local climate refinements.
         *
         * These exist to stop broad interpolation from flattening important
         * European regional differences.
         *
         * You can add more regions here without modifying climate.js.
         */

        localModifiers: [

            {
                name: "Western Norway",
                lat: 61.5,
                lon: 5.5,
                radiusKm: 430,
                strength: 1.0,
                weights: {
                    "Atlantic": 80,
                    "Polar Maritime": 45
                }
            },

            {
                name: "Scandinavian Interior",
                lat: 62,
                lon: 15,
                radiusKm: 680,
                strength: 1.0,
                weights: {
                    "Scandinavian Interior": 90,
                    "Eurasian Continental": 30
                }
            },

            {
                name: "Western Britain and Ireland",
                lat: 53.5,
                lon: -7,
                radiusKm: 550,
                strength: 1.0,
                weights: {
                    "Atlantic": 70,
                    "British Landmass": 45,
                    "Polar Maritime": 15
                }
            },

            {
                name: "Eastern England",
                lat: 52.5,
                lon: 0.5,
                radiusKm: 420,
                strength: 0.8,
                weights: {
                    "British Landmass": 60,
                    "North Sea": 40,
                    "West-Central European": 20
                }
            },

            {
                name: "Scotland",
                lat: 57,
                lon: -4,
                radiusKm: 460,
                strength: 0.8,
                weights: {
                    "British Landmass": 65,
                    "Atlantic": 45,
                    "Polar Maritime": 35
                }
            },

            {
                name: "Brittany",
                lat: 48.2,
                lon: -3,
                radiusKm: 350,
                strength: 0.8,
                weights: {
                    "Atlantic": 75,
                    "West-Central European": 35
                }
            },

            {
                name: "Central France",
                lat: 47,
                lon: 2.5,
                radiusKm: 540,
                strength: 0.9,
                weights: {
                    "West-Central European": 85,
                    "Atlantic": 25
                }
            },

            {
                name: "Provence",
                lat: 43.7,
                lon: 5.5,
                radiusKm: 320,
                strength: 0.9,
                weights: {
                    "Mediterranean": 80,
                    "West-Central European": 20
                }
            },

            {
                name: "Galicia",
                lat: 42.8,
                lon: -8,
                radiusKm: 330,
                strength: 0.9,
                weights: {
                    "Atlantic": 80,
                    "Iberian Interior": 25
                }
            },

            {
                name: "Castile",
                lat: 40.5,
                lon: -4,
                radiusKm: 500,
                strength: 1.0,
                weights: {
                    "Iberian Interior": 100
                }
            },

            {
                name: "Mediterranean Spain",
                lat: 39,
                lon: -0.5,
                radiusKm: 430,
                strength: 1.0,
                weights: {
                    "Mediterranean": 85,
                    "Iberian Interior": 25
                }
            },

            {
                name: "Po Valley",
                lat: 45.1,
                lon: 10,
                radiusKm: 360,
                strength: 1.0,
                weights: {
                    "West-Central European": 45,
                    "Central / Eastern European": 25,
                    "Mediterranean": 25
                }
            },

            {
                name: "Southern Italy",
                lat: 39,
                lon: 16,
                radiusKm: 500,
                strength: 1.0,
                weights: {
                    "Mediterranean": 100,
                    "North African": 20
                }
            },

            {
                name: "Slovenia",
                lat: 46.1,
                lon: 14.8,
                radiusKm: 260,
                strength: 1.0,
                weights: {
                    "West-Central European": 45,
                    "Balkan Modified": 35,
                    "Mediterranean": 15
                }
            },

            {
                name: "Zagreb Interior Croatia",
                lat: 45.8,
                lon: 16.0,
                radiusKm: 300,
                strength: 1.0,
                weights: {
                    "Central / Eastern European": 55,
                    "Balkan Modified": 45,
                    "Mediterranean": 10
                }
            },

            {
                name: "Dalmatia",
                lat: 43.5,
                lon: 16.4,
                radiusKm: 390,
                strength: 1.2,
                weights: {
                    "Mediterranean": 95,
                    "Balkan Modified": 35
                }
            },

            {
                name: "Transylvania",
                lat: 46.5,
                lon: 24.5,
                radiusKm: 430,
                strength: 1.1,
                weights: {
                    "Central / Eastern European": 80,
                    "Balkan Modified": 25,
                    "Eurasian Continental": 25
                }
            },

            {
                name: "Wallachia",
                lat: 44.4,
                lon: 26,
                radiusKm: 470,
                strength: 1.0,
                weights: {
                    "Central / Eastern European": 65,
                    "Balkan Modified": 40,
                    "Black Sea": 15
                }
            },

            {
                name: "Pomerania",
                lat: 54,
                lon: 16,
                radiusKm: 430,
                strength: 1.0,
                weights: {
                    "Baltic Maritime": 65,
                    "Central / Eastern European": 50,
                    "North Sea": 10
                }
            },

            {
                name: "Greater Poland",
                lat: 52.3,
                lon: 17,
                radiusKm: 420,
                strength: 1.0,
                weights: {
                    "Central / Eastern European": 80,
                    "West-Central European": 25,
                    "Baltic Maritime": 15
                }
            },

            {
                name: "Masovia",
                lat: 52.2,
                lon: 21,
                radiusKm: 430,
                strength: 1.0,
                weights: {
                    "Central / Eastern European": 85,
                    "Eurasian Continental": 20
                }
            },

            {
                name: "Ukraine Interior",
                lat: 49,
                lon: 32,
                radiusKm: 720,
                strength: 1.0,
                weights: {
                    "Central / Eastern European": 60,
                    "Eurasian Continental": 70
                }
            },

            {
                name: "Crimea Black Sea Coast",
                lat: 44.8,
                lon: 34,
                radiusKm: 320,
                strength: 1.0,
                weights: {
                    "Black Sea": 80,
                    "Mediterranean": 20,
                    "Central / Eastern European": 20
                }
            },

            {
                name: "Central Anatolia",
                lat: 39,
                lon: 33,
                radiusKm: 600,
                strength: 1.0,
                weights: {
                    "Anatolian Interior": 100,
                    "Eurasian Continental": 20
                }
            },

            {
                name: "Aegean Turkey",
                lat: 38.5,
                lon: 27,
                radiusKm: 420,
                strength: 1.0,
                weights: {
                    "Mediterranean": 85,
                    "Anatolian Interior": 25
                }
            }
        ]
    },


    /* ========================================================================
       OCEAN
       ======================================================================== */

    ocean: {

        heatCapacityFactor: 0.035,

        airSeaHeatExchange: 0.020,

        evaporationFactor: 0.010,

        windExchangeBoost: 0.065,

        seasonalRelaxation: 0.0015,

        minSstC: -2.0,

        maxSstC: 31.0
    },


    /* ========================================================================
       ATMOSPHERE
       ======================================================================== */

    atmosphere: {

        pressureRelaxation: 0.010,

        thermalPressureCoupling: 0.030,

        moistureDiffusion: 0.010,

        temperatureDiffusion: 0.006,

        momentumDiffusion: 0.010,

        surfaceDragLand: 0.11,

        surfaceDragSea: 0.055,

        mixingRateLand: 0.045,

        mixingRateSea: 0.030
    },


    /* ========================================================================
       MOISTURE
       ======================================================================== */

    moisture: {

        condensationRate: 0.32,

        cloudDecay: 0.10,

        precipEfficiency: 0.48,

        frontalLiftFactor: 0.85,

        orographicLiftFactor: 0.50,

        convectiveLiftFactor: 0.35
    },


    /* ========================================================================
       RADIATION
       ======================================================================== */

    radiation: {

        landHeating: 0.080,

        landCooling: 0.060,

        seaHeating: 0.012,

        cloudShortwaveSuppression: 0.72,

        cloudLongwaveRetention: 0.72,

        snowAlbedoCooling: 0.55
    },


    /* ========================================================================
       PRECIPITATION / SNOW
       ======================================================================== */

    precipitationPhase: {

        snowMaxC: 1.5,

        sleetMaxC: 3.0
    },


    snow: {

        accumulationEfficiency: 0.11,

        meltRate: 0.035,

        minimumPersistentDepthCm: 0.2
    },


    /* ========================================================================
       USER STEERING ARROWS
       ======================================================================== */

    forcing: {

        maxArrows: 8,

        defaultWidthKm: 850,

        defaultSpeedKmh: 40,

        defaultStrength: 0.60,

        maxSpeedKmh: 140
    },


    /* ========================================================================
       WEATHER STATIONS / HISTORY
       ======================================================================== */

    history: {

        snapshotEveryMinutes: 60,

        maxSnapshots: 24 * 35,

        stationSampleEveryMinutes: 10,

        maxStationSamples: 24 * 6 * 90
    }
};


global.EuropaConfig = CONFIG;

})(window);
