/* ============================================================================
   EuropaCraft Weather Simulator
   Persistent Ocean / SST System
   Version 7.1

   NEW FILE

   PURPOSE

   The ocean is a persistent physical state.

   SST does NOT reset to a monthly normal every timestep.

   Instead:

       previous SST
           +
       seasonal tendency
           +
       air-sea heat exchange
           +
       wind-dependent mixing
           +
       basin character
           =
       new SST


   IMPORTANT

   This file does NOT generate temperature anomalies.

   The atmosphere exchanges heat and moisture with the ocean physically.

   Example:

       Continental air: -12°C
       North Sea SST:    +7°C
       Strong wind

   The cold air should be substantially warmed and moistened during its sea
   crossing.

   Most important editable values remain in:

       europacraft-config.js
============================================================================ */

(function (global) {
"use strict";


const U = global.EuropaUtils;
const C = global.EuropaConfig;

const O = C.ocean;


/* ============================================================================
   BASIN MASK HELPERS
============================================================================ */

function basinGaussian(
    lat,
    lon,
    centerLat,
    centerLon,
    radiusLat,
    radiusLon
) {

    return U.gaussian2D(
        lat,
        lon,
        centerLat,
        centerLon,
        radiusLat,
        radiusLon
    );
}


/* ============================================================================
   BASIN PROPERTIES

   These describe broad sea characteristics.

   They are climatological geography, not current weather.
============================================================================ */

function getBasinProperties(
    lat,
    lon
) {

    const atlantic = basinGaussian(
        lat,
        lon,
        52,
        -16,
        15,
        16
    );


    const northSea = basinGaussian(
        lat,
        lon,
        56,
        3,
        4.8,
        5.2
    );


    const baltic = basinGaussian(
        lat,
        lon,
        58,
        19,
        5.0,
        7.0
    );


    const mediterranean = basinGaussian(
        lat,
        lon,
        38,
        16,
        6.5,
        17
    );


    const blackSea = basinGaussian(
        lat,
        lon,
        43,
        34,
        4.5,
        8.5
    );


    const norwegianSea = basinGaussian(
        lat,
        lon,
        65,
        3,
        8,
        8
    );


    const barents = basinGaussian(
        lat,
        lon,
        72,
        31,
        5,
        11
    );


    const icelandic = basinGaussian(
        lat,
        lon,
        64,
        -20,
        5,
        8
    );


    const bayOfBiscay = basinGaussian(
        lat,
        lon,
        46,
        -8,
        5,
        6
    );


    const englishChannel = basinGaussian(
        lat,
        lon,
        50.2,
        -1.5,
        1.5,
        5
    );


    const adriatic = basinGaussian(
        lat,
        lon,
        43,
        15.5,
        5,
        2
    );


    const aegean = basinGaussian(
        lat,
        lon,
        38.5,
        25,
        4,
        4
    );


    return {

        atlantic,

        northSea,

        baltic,

        mediterranean,

        blackSea,

        norwegianSea,

        barents,

        icelandic,

        bayOfBiscay,

        englishChannel,

        adriatic,

        aegean
    };
}


/* ============================================================================
   CLIMATOLOGICAL SST TARGET

   This is NOT the actual SST.

   It is only the long-term seasonal temperature that the persistent ocean
   slowly tends toward.

   Actual SST can remain warmer or colder for long periods.
============================================================================ */

function seasonalTargetSST(
    lat,
    lon,
    dateInput
) {

    const date = (
        dateInput instanceof Date
            ? dateInput
            : new Date(dateInput)
    );


    const doy = U.dayOfYearUTC(
        date
    );


    const basin = getBasinProperties(
        lat,
        lon
    );


    /* ========================================================================
       LATITUDE BASELINE
       ======================================================================== */

    let annualMean = (
        19.0 -
        Math.max(
            0,
            lat - 35
        ) *
        0.34
    );


    /* ========================================================================
       NORTH ATLANTIC CURRENT / ATLANTIC WARMTH

       Prevents northeastern Atlantic SST from becoming excessively cold.
       ======================================================================== */

    annualMean += (
        basin.atlantic *
        1.3
    );


    annualMean += (
        basin.norwegianSea *
        1.5
    );


    annualMean += (
        basin.bayOfBiscay *
        1.1
    );


    /* ========================================================================
       BASIN MODIFIERS
       ======================================================================== */

    annualMean += (
        basin.mediterranean *
        3.0
    );


    annualMean += (
        basin.aegean *
        1.0
    );


    annualMean += (
        basin.adriatic *
        0.6
    );


    annualMean += (
        basin.blackSea *
        0.3
    );


    annualMean -= (
        basin.baltic *
        1.3
    );


    annualMean -= (
        basin.icelandic *
        1.8
    );


    annualMean -= (
        basin.barents *
        5.0
    );


    /* ========================================================================
       SEASONAL RANGE

       Inland and enclosed seas vary more than the open Atlantic.
       ======================================================================== */

    let amplitude = (
        3.8 +
        Math.max(
            0,
            lat - 38
        ) *
        0.075
    );


    amplitude += (
        basin.baltic *
        3.5
    );


    amplitude += (
        basin.blackSea *
        2.8
    );


    amplitude += (
        basin.adriatic *
        1.5
    );


    amplitude += (
        basin.aegean *
        1.0
    );


    amplitude -= (
        basin.atlantic *
        0.8
    );


    amplitude -= (
        basin.norwegianSea *
        0.6
    );


    /* ========================================================================
       SEASONAL LAG

       Sea normally reaches maximum temperature later than land.
       ======================================================================== */

    let peakDay = 225;


    peakDay += (
        basin.baltic *
        3
    );


    peakDay += (
        basin.blackSea *
        2
    );


    peakDay -= (
        basin.mediterranean *
        2
    );


    const seasonalWave = Math.cos(
        2 *
        Math.PI *
        (
            doy -
            peakDay
        ) /
        365.2422
    );


    let target = (
        annualMean +
        amplitude *
        seasonalWave
    );


    /* ========================================================================
       WINTER SEA-ICE-LIKE FLOOR BEHAVIOUR

       We are not yet explicitly simulating sea ice, but very cold northern
       water is prevented from becoming unrealistically colder than saline
       freezing conditions.
       ======================================================================== */

    target = U.clamp(
        target,
        O.minSstC,
        O.maxSstC
    );


    return target;
}


/* ============================================================================
   EVAPORATION POTENTIAL

   Returns a dimensionless strength used by atmosphere physics.

   It becomes strong when:

       SST > air temperature
       air is dry
       wind is strong

   Actual moisture transfer is performed by atmospheric physics.
============================================================================ */

function evaporationPotential(
    sstC,
    airTempC,
    relativeHumidity,
    windSpeedMs
) {

    const thermalDifference = Math.max(
        0,
        sstC -
        airTempC
    );


    const dryness = U.clamp(
        1 -
        relativeHumidity,
        0,
        1
    );


    const windFactor = (
        1 +
        Math.min(
            30,
            Math.max(
                0,
                windSpeedMs
            )
        ) *
        O.windExchangeBoost
    );


    return (
        (
            0.35 +
            thermalDifference *
            0.12
        ) *
        (
            0.2 +
            dryness *
            0.8
        ) *
        windFactor
    );
}


/* ============================================================================
   AIR-SEA HEAT EXCHANGE POTENTIAL

   Positive:
       ocean warms atmosphere

   Negative:
       atmosphere warms ocean
============================================================================ */

function airSeaHeatFluxPotential(
    sstC,
    airTempC,
    windSpeedMs
) {

    const difference = (
        sstC -
        airTempC
    );


    const windFactor = (
        1 +
        Math.min(
            35,
            Math.max(
                0,
                windSpeedMs
            )
        ) *
        O.windExchangeBoost
    );


    return (
        difference *
        O.airSeaHeatExchange *
        windFactor
    );
}


/* ============================================================================
   OCEAN CLASS
============================================================================ */

class Ocean {

    constructor(
        terrain,
        date
    ) {

        this.terrain = terrain;

        this.n = terrain.n;


        this.sst = new Float32Array(
            this.n
        );


        this.targetSST = new Float32Array(
            this.n
        );


        this.thermalMemory = new Float32Array(
            this.n
        );


        this.initialize(
            date
        );
    }


    /* ========================================================================
       INITIALISATION
       ======================================================================== */

    initialize(
        date
    ) {

        for (
            let i = 0;
            i < this.n;
            i++
        ) {

            const lat = this.terrain.lat[i];

            const lon = this.terrain.lon[i];


            const target = seasonalTargetSST(
                lat,
                lon,
                date
            );


            this.targetSST[i] = target;


            /*
             * Initial actual SST starts close to climatology.
             *
             * From then onward it becomes persistent.
             */

            this.sst[i] = target;


            this.thermalMemory[i] = 0;
        }
    }


    /* ========================================================================
       UPDATE TARGET SST
       ======================================================================== */

    updateSeasonalTargets(
        date
    ) {

        for (
            let i = 0;
            i < this.n;
            i++
        ) {

            if (
                this.terrain.land[i] >
                0.55
            ) {

                continue;
            }


            this.targetSST[i] = seasonalTargetSST(
                this.terrain.lat[i],
                this.terrain.lon[i],
                date
            );
        }
    }


    /* ========================================================================
       PHYSICS STEP
       ======================================================================== */

    step(
        date,
        airTemp,
        windU,
        windV,
        dtHours
    ) {

        this.updateSeasonalTargets(
            date
        );


        for (
            let i = 0;
            i < this.n;
            i++
        ) {

            const landFraction = (
                this.terrain.land[i]
            );


            if (
                landFraction >
                0.55
            ) {

                continue;
            }


            const currentSST = (
                this.sst[i]
            );


            const target = (
                this.targetSST[i]
            );


            const airT = (
                airTemp[i]
            );


            const windSpeed = Math.hypot(
                windU[i],
                windV[i]
            );


            /* ================================================================
               SEASONAL RELAXATION

               Very slow.

               This ensures one warm afternoon does not alter the ocean much,
               while weeks of seasonal change gradually do.
               ================================================================ */

            const seasonalTendency = (
                (
                    target -
                    currentSST
                ) *
                O.seasonalRelaxation *
                dtHours
            );


            /* ================================================================
               AIR-SEA EXCHANGE

               Warm air over cold water warms the sea.

               Cold air over warm water cools the sea.

               Because ocean heat capacity is large, SST responds only weakly.
               ================================================================ */

            const airDifference = (
                airT -
                currentSST
            );


            const windExchange = (
                1 +
                Math.min(
                    35,
                    windSpeed
                ) *
                O.windExchangeBoost
            );


            const exchangeTendency = (
                airDifference *
                O.airSeaHeatExchange *
                windExchange *
                O.heatCapacityFactor *
                dtHours
            );


            /* ================================================================
               THERMAL MEMORY

               Keeps persistent SST anomalies from disappearing immediately.

               This is intentionally slow-moving.
               ================================================================ */

            this.thermalMemory[i] = (
                this.thermalMemory[i] *
                0.9985 +
                exchangeTendency *
                0.15
            );


            let newSST = (
                currentSST +
                seasonalTendency +
                exchangeTendency +
                this.thermalMemory[i] *
                dtHours *
                0.02
            );


            newSST = U.clamp(
                newSST,
                O.minSstC,
                O.maxSstC
            );


            this.sst[i] = newSST;
        }


        this._mixOcean(
            dtHours
        );
    }


    /* ========================================================================
       OCEAN MIXING

       Prevents tiny isolated SST cells.

       This is weak because real SST gradients should remain possible.
       ======================================================================== */

    _mixOcean(
        dtHours
    ) {

        const nx = this.terrain.nx;
        const ny = this.terrain.ny;


        const original = new Float32Array(
            this.sst
        );


        const strength = U.clamp(
            0.008 *
            dtHours,
            0,
            0.04
        );


        for (
            let y = 1;
            y < ny - 1;
            y++
        ) {

            for (
                let x = 1;
                x < nx - 1;
                x++
            ) {

                const i = (
                    y *
                    nx +
                    x
                );


                if (
                    this.terrain.land[i] >
                    0.55
                ) {

                    continue;
                }


                let sum = 0;

                let count = 0;


                const neighbours = [

                    i - 1,

                    i + 1,

                    i - nx,

                    i + nx
                ];


                for (
                    const j
                    of neighbours
                ) {

                    if (
                        this.terrain.land[j] <
                        0.55
                    ) {

                        sum += original[j];

                        count++;
                    }
                }


                if (
                    count > 0
                ) {

                    const neighbourAverage = (
                        sum /
                        count
                    );


                    this.sst[i] = U.lerp(
                        original[i],
                        neighbourAverage,
                        strength
                    );
                }
            }
        }
    }


    /* ========================================================================
       SAMPLE
       ======================================================================== */

    sample(
        lat,
        lon
    ) {

        return this.terrain.sampleArray(
            this.sst,
            lat,
            lon
        );
    }


    sampleTarget(
        lat,
        lon
    ) {

        return this.terrain.sampleArray(
            this.targetSST,
            lat,
            lon
        );
    }


    sampleMemory(
        lat,
        lon
    ) {

        return this.terrain.sampleArray(
            this.thermalMemory,
            lat,
            lon
        );
    }
}


/* ============================================================================
   EXPORT
============================================================================ */

global.EuropaOcean = Object.freeze({

    Ocean,

    seasonalTargetSST,

    getBasinProperties,

    evaporationPotential,

    airSeaHeatFluxPotential
});

})(window);
