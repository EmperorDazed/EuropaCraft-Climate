/* ============================================================================
   EuropaCraft Weather Simulator
   Atmospheric Physics Engine
   Version 7.2

   COMPLETE CORRECTED FILE

   DEFAULT PHYSICS TIMESTEP:
       4 simulated minutes

   The timestep is configurable through:

       EuropaConfig.grid.physicsStepMinutes

   PURPOSE

   This file advances the ACTUAL persistent atmosphere.

   Major processes:

       - synoptic pressure evolution
       - pressure-gradient wind
       - cyclone / anticyclone circulation
       - steering-arrow forcing
       - surface friction
       - semi-Lagrangian advection
       - temperature transport
       - humidity transport
       - cloud transport
       - air-mass tracer transport
       - ground heating and cooling
       - air-sea heat exchange
       - evaporation
       - relative humidity
       - condensation
       - cloud formation
       - convergence
       - temperature-gradient fronts
       - orographic uplift
       - vertical-motion proxy
       - precipitation
       - rain / sleet / snow
       - snow accumulation and melting
       - surface wetness
       - weak numerical diffusion
       - air-mass modification history

   HARD DESIGN RULE

   The simulator NEVER creates weather by generating a temperature anomaly.

   Instead:

       wind moves air
       surfaces modify air
       radiation modifies surfaces and air
       moisture condenses
       clouds modify heating and cooling
       terrain modifies flow
       snow modifies surface energy

       -> ACTUAL TEMPERATURE

   Only afterwards:

       anomaly =
           actual temperature
           -
           climatological temperature

   Anomaly is therefore diagnostic only.

============================================================================ */

(function (global) {
"use strict";


const U = global.EuropaUtils;
const C = global.EuropaConfig;

const AIR_MASS = global.EuropaAirMass;
const AIR_MASS_COUNT = global.EuropaAirMassCount;

const PHASE = global.EuropaPrecipPhase;


/* ============================================================================
   PHYSICS CONSTANTS
============================================================================ */

const P = Object.freeze({

    /* ========================================================================
       PRESSURE
       ======================================================================== */

    pressureTargetRelaxationPerHour:
        0.34,

    thermalPressureCouplingHpaPerCPerHour:
        0.012,

    pressureDiffusionPerHour:
        0.045,


    /* ========================================================================
       WIND
       ======================================================================== */

    pressureGradientWindFactor:
        1.85,

    synopticWindResponsePerHour:
        1.8,

    steeringWindResponsePerHour:
        2.4,

    windDiffusionPerHour:
        0.040,

    backgroundWesterlyMs:
        1.8,


    /* ========================================================================
       ADVECTION
       ======================================================================== */

    maximumBacktraceCells:
        4.5,


    /* ========================================================================
       SURFACE HEAT EXCHANGE
       ======================================================================== */

    landAirExchangePerHour:
        0.18,

    seaAirExchangePerHour:
        0.28,

    groundResponsePerHour:
        0.12,

    groundAirCouplingPerHour:
        0.08,


    /* ========================================================================
       RADIATION
       ======================================================================== */

    daylightGroundHeatingCPerHour:
        1.10,

    nighttimeGroundCoolingCPerHour:
        0.62,

    cloudyNightCoolingMultiplier:
        0.24,

    cloudyDayHeatingMultiplier:
        0.30,

    snowSolarReduction:
        0.52,


    /* ========================================================================
       MOISTURE
       ======================================================================== */

    seaEvaporationPerHour:
        0.00048,

    wetLandEvaporationPerHour:
        0.00013,

    cloudEvaporationPerHour:
        0.12,

    condensationEfficiency:
        0.72,


    /* ========================================================================
       CLOUD
       ======================================================================== */

    cloudFormationScale:
        5.0,

    cloudWaterDecayPerHour:
        0.035,

    cloudFractionDecayPerHour:
        0.040,

    /*
     * CORRECTED:
     * Previously referenced but not defined.
     */

    cloudDiffusionPerHour:
        0.010,


    /* ========================================================================
       FRONTS / VERTICAL MOTION
       ======================================================================== */

    convergenceScale:
        18,

    temperatureGradientScale:
        5.2,

    frontalLiftScale:
        0.95,

    convergenceLiftScale:
        0.90,

    orographicLiftScale:
        0.85,

    thermalLiftScale:
        0.24,

    verticalMotionDecayPerHour:
        0.60,


    /* ========================================================================
       BOUNDARY LAYER

       CORRECTED:
       These two constants were previously referenced but missing.
       ======================================================================== */

    unstableMixingBoost:
        1.35,

    stableMixingReduction:
        0.45,


    /* ========================================================================
       PRECIPITATION
       ======================================================================== */

    cloudWaterPrecipThreshold:
        0.08,

    precipEfficiency:
        3.5,

    upliftPrecipBoost:
        4.2,

    maxPrecipRateMmHr:
        80,


    /* ========================================================================
       SNOW
       ======================================================================== */

    snowLiquidEquivalentRatio:
        10,

    snowCompactionPerHour:
        0.003,

    baseSnowMeltCmPerHour:
        0.025,

    warmSnowMeltCmPerHourPerC:
        0.11,

    rainSnowMeltMultiplier:
        0.13,


    /* ========================================================================
       SURFACE WETNESS
       ======================================================================== */

    wetnessFromRain:
        0.060,

    wetnessFromSleet:
        0.035,

    wetnessDryingPerHour:
        0.035,


    /* ========================================================================
       AIR-MASS HISTORY
       ======================================================================== */

    tracerSurfaceAdjustmentPerHour:
        0.020,

    tracerMixingPerHour:
        0.018,

    maritimeTracerConversionPerHour:
        0.055,

    landTracerConversionPerHour:
        0.014,


    /* ========================================================================
       NUMERICAL LIMITS
       ======================================================================== */

    minimumTemperatureC:
        -65,

    maximumTemperatureC:
        55,

    maximumSpecificHumidity:
        0.045,

    maximumCloudWater:
        3.0
});


/* ============================================================================
   GRID HELPERS
============================================================================ */

function idx(
    x,
    y,
    nx
) {

    return (
        y *
        nx +
        x
    );
}


function clampGridX(
    x,
    nx
) {

    return U.clamp(
        x,
        0,
        nx - 1.000001
    );
}


function clampGridY(
    y,
    ny
) {

    return U.clamp(
        y,
        0,
        ny - 1.000001
    );
}


/* ============================================================================
   SETTINGS HELPER
============================================================================ */

function setting(
    group,
    key,
    fallback
) {

    if (
        group &&
        Number.isFinite(
            Number(
                group[key]
            )
        )
    ) {

        return Number(
            group[key]
        );
    }


    return fallback;
}


/* ============================================================================
   TIME
============================================================================ */

function getTimestep() {

    const minutes = Math.max(

        0.1,

        Number(
            C.grid.physicsStepMinutes
        ) ||
        4
    );


    return {

        minutes,

        hours:
            minutes /
            60,

        seconds:
            minutes *
            60
    };
}


/* ============================================================================
   GRID SPACING
============================================================================ */

function getGridSpacing(
    terrain,
    y
) {

    const rowIndex = idx(

        0,

        U.clamp(
            Math.round(
                y
            ),
            0,
            terrain.ny - 1
        ),

        terrain.nx
    );


    const lat = (
        terrain.lat[
            rowIndex
        ]
    );


    const dxDegrees = (

        (
            C.bounds.east -
            C.bounds.west
        ) /

        Math.max(
            1,
            terrain.nx - 1
        )
    );


    const dyDegrees = (

        (
            C.bounds.north -
            C.bounds.south
        ) /

        Math.max(
            1,
            terrain.ny - 1
        )
    );


    return {

        dxKm:

            dxDegrees *

            U.kmPerDegreeLongitude(
                lat
            ),


        dyKm:

            dyDegrees *

            U.kmPerDegreeLatitude()
    };
}


/* ============================================================================
   DERIVATIVES
============================================================================ */

function gradientX(
    field,
    x,
    y,
    terrain
) {

    const nx = (
        terrain.nx
    );


    const center = (
        field[
            idx(
                x,
                y,
                nx
            )
        ]
    );


    const left = (

        x > 0

            ? field[
                idx(
                    x - 1,
                    y,
                    nx
                )
            ]

            : center
    );


    const right = (

        x <
        terrain.nx - 1

            ? field[
                idx(
                    x + 1,
                    y,
                    nx
                )
            ]

            : center
    );


    const spacing = (
        getGridSpacing(
            terrain,
            y
        ).dxKm
    );


    const divisor = (

        x > 0 &&
        x <
        terrain.nx - 1

            ? spacing *
              2

            : spacing
    );


    return (

        (
            right -
            left
        ) /

        Math.max(
            0.001,
            divisor
        )
    );
}


function gradientY(
    field,
    x,
    y,
    terrain
) {

    const nx = (
        terrain.nx
    );


    const center = (
        field[
            idx(
                x,
                y,
                nx
            )
        ]
    );


    const north = (

        y > 0

            ? field[
                idx(
                    x,
                    y - 1,
                    nx
                )
            ]

            : center
    );


    const south = (

        y <
        terrain.ny - 1

            ? field[
                idx(
                    x,
                    y + 1,
                    nx
                )
            ]

            : center
    );


    const spacing = (
        getGridSpacing(
            terrain,
            y
        ).dyKm
    );


    const divisor = (

        y > 0 &&
        y <
        terrain.ny - 1

            ? spacing *
              2

            : spacing
    );


    /*
     * Positive result means increasing toward north.
     */

    return (

        (
            north -
            south
        ) /

        Math.max(
            0.001,
            divisor
        )
    );
}


/* ============================================================================
   LOCAL BILINEAR SAMPLER

   Kept inside physics so compatibility does not depend on the exact
   EuropaUtils.bilinear argument signature.
============================================================================ */

function bilinearSample(
    field,
    nx,
    ny,
    x,
    y
) {

    x = U.clamp(
        x,
        0,
        nx - 1
    );


    y = U.clamp(
        y,
        0,
        ny - 1
    );


    const x0 = Math.floor(
        x
    );


    const y0 = Math.floor(
        y
    );


    const x1 = Math.min(
        nx - 1,
        x0 + 1
    );


    const y1 = Math.min(
        ny - 1,
        y0 + 1
    );


    const tx = (
        x -
        x0
    );


    const ty = (
        y -
        y0
    );


    const i00 = (
        y0 *
        nx +
        x0
    );


    const i10 = (
        y0 *
        nx +
        x1
    );


    const i01 = (
        y1 *
        nx +
        x0
    );


    const i11 = (
        y1 *
        nx +
        x1
    );


    const top = U.lerp(

        field[i00],

        field[i10],

        tx
    );


    const bottom = U.lerp(

        field[i01],

        field[i11],

        tx
    );


    return U.lerp(

        top,

        bottom,

        ty
    );
}


/* ============================================================================
   SOLAR GEOMETRY
============================================================================ */

function solarDeclinationRad(
    dayOfYear
) {

    return (

        23.44 *

        U.DEG *

        Math.sin(

            2 *
            Math.PI *
            (
                dayOfYear -
                80
            ) /
            365.2422
        )
    );
}


function solarFactor(
    lat,
    lon,
    date
) {

    const doy = (
        U.dayOfYearUTC(
            date
        )
    );


    const declination = (
        solarDeclinationRad(
            doy
        )
    );


    const latitude = (
        lat *
        U.DEG
    );


    const utcHour = (
        U.fractionalHourUTC(
            date
        )
    );


    const localSolarHour = (

        utcHour +
        lon /
        15
    );


    const hourAngle = (

        (
            localSolarHour -
            12
        ) *

        15 *

        U.DEG
    );


    const sineElevation = (

        Math.sin(
            latitude
        ) *

        Math.sin(
            declination
        ) +

        Math.cos(
            latitude
        ) *

        Math.cos(
            declination
        ) *

        Math.cos(
            hourAngle
        )
    );


    return U.clamp(
        sineElevation,
        0,
        1
    );
}


/* ============================================================================
   FIELD DIFFUSION
============================================================================ */

function diffuse(
    field,
    nx,
    ny,
    strength,
    minValue = -Infinity,
    maxValue = Infinity
) {

    if (
        strength <= 0
    ) {

        return;
    }


    const original = (
        new Float32Array(
            field
        )
    );


    for (
        let y = 1;
        y <
        ny - 1;
        y++
    ) {

        for (
            let x = 1;
            x <
            nx - 1;
            x++
        ) {

            const i = (
                idx(
                    x,
                    y,
                    nx
                )
            );


            const average = (

                original[
                    i - 1
                ] +

                original[
                    i + 1
                ] +

                original[
                    i - nx
                ] +

                original[
                    i + nx
                ]

            ) /
            4;


            field[i] = U.clamp(

                U.lerp(

                    original[i],

                    average,

                    strength
                ),

                minValue,

                maxValue
            );
        }
    }
}


/* ============================================================================
   PHYSICS ENGINE
============================================================================ */

class PhysicsEngine {

    constructor(
        terrain,
        ocean,
        synoptic,
        atmosphere
    ) {

        this.terrain = (
            terrain
        );


        this.ocean = (
            ocean
        );


        this.synoptic = (
            synoptic
        );


        this.atmosphere = (
            atmosphere
        );


        this.nx = (
            terrain.nx
        );


        this.ny = (
            terrain.ny
        );


        this.n = (
            terrain.n
        );


        /* ====================================================================
           ADVECTION BUFFERS
           ==================================================================== */

        this.nextTemperature =
            new Float32Array(
                this.n
            );


        this.nextHumidity =
            new Float32Array(
                this.n
            );


        this.nextCloudWater =
            new Float32Array(
                this.n
            );


        this.nextCloudFraction =
            new Float32Array(
                this.n
            );


        this.nextAirMassTracer =
            new Float32Array(
                this.n *
                AIR_MASS_COUNT
            );


        /* ====================================================================
           PRESSURE / WIND WORK ARRAYS
           ==================================================================== */

        this.targetPressure =
            new Float32Array(
                this.n
            );


        this.nextPressure =
            new Float32Array(
                this.n
            );


        this.nextWindU =
            new Float32Array(
                this.n
            );


        this.nextWindV =
            new Float32Array(
                this.n
            );
    }


    /* ========================================================================
       MAIN PHYSICS STEP
       ======================================================================== */

    step(
        dateInput,
        explicitMinutes = null
    ) {

        const date = (

            dateInput instanceof Date

                ? dateInput

                : new Date(
                    dateInput
                )
        );


        let timestep;


        if (
            explicitMinutes ===
            null ||
            explicitMinutes ===
            undefined
        ) {

            timestep = (
                getTimestep()
            );
        }

        else {

            const minutes = Math.max(

                0.1,

                Number(
                    explicitMinutes
                ) ||
                4
            );


            timestep = {

                minutes,

                hours:
                    minutes /
                    60,

                seconds:
                    minutes *
                    60
            };
        }


        const dtHours = (
            timestep.hours
        );


        /* ====================================================================
           1. SYNOPTIC SYSTEM EVOLUTION
           ==================================================================== */

        if (
            this.synoptic &&
            typeof this.synoptic.advanceSystems ===
            "function"
        ) {

            this.synoptic.advanceSystems(
                dtHours
            );
        }


        /* ====================================================================
           2. PRESSURE
           ==================================================================== */

        this._updatePressure(
            dtHours
        );


        /* ====================================================================
           3. WIND
           ==================================================================== */

        this._updateWind(
            dtHours
        );


        /* ====================================================================
           4. AIR TRANSPORT
           ==================================================================== */

        this._advect(
            dtHours
        );


        /* ====================================================================
           5. SURFACE / RADIATION
           ==================================================================== */

        this._surfacePhysics(
            date,
            dtHours
        );


        /* ====================================================================
           6. AIR-MASS HISTORY
           ==================================================================== */

        this._updateAirMassHistory(
            dtHours
        );


        /* ====================================================================
           7. DYNAMICS / FRONTS / ASCENT
           ==================================================================== */

        this._calculateDynamics(
            dtHours
        );


        /* ====================================================================
           8. MOISTURE / CLOUD / PRECIPITATION
           ==================================================================== */

        this._moisturePhysics(
            dtHours
        );


        /* ====================================================================
           9. SNOW / GROUND WATER
           ==================================================================== */

        this._snowAndSurfaceWater(
            date,
            dtHours
        );


        /* ====================================================================
           10. NUMERICAL MIXING
           ==================================================================== */

        this._numericalMixing(
            dtHours
        );


        /* ====================================================================
           11. OCEAN
           ==================================================================== */

        if (
            this.ocean &&
            typeof this.ocean.step ===
            "function"
        ) {

            this.ocean.step(

                date,

                this.atmosphere.temperatureC,

                this.atmosphere.windU,

                this.atmosphere.windV,

                dtHours
            );
        }


        /* ====================================================================
           12. DIAGNOSTICS LAST

           This includes climatology and anomaly.

           anomaly =
               actual -
               climatology
           ==================================================================== */

        this.atmosphere.updateDerivedFields(
            date
        );
    }


    /* ========================================================================
       PRESSURE
       ======================================================================== */

    _updatePressure(
        dtHours
    ) {

        const A = (
            this.atmosphere
        );


        let synopticTarget = null;


        if (
            this.synoptic &&
            typeof this.synoptic.pressureField ===
            "function"
        ) {

            synopticTarget = (
                this.synoptic.pressureField()
            );
        }


        for (
            let i = 0;
            i <
            this.n;
            i++
        ) {

            let target = (

                synopticTarget

                    ? synopticTarget[i]

                    : 1015
            );


            if (
                !Number.isFinite(
                    target
                )
            ) {

                target = (
                    1015
                );
            }


            /*
             * Very weak thermal response.

             * The anomaly is only being OBSERVED here as a pressure feedback.
             * It does not create temperature.
             */

            const thermalDifference = (

                A.temperatureC[i] -
                A.climatologyC[i]
            );


            target -= (

                thermalDifference *

                P.thermalPressureCouplingHpaPerCPerHour
            );


            this.targetPressure[i] = (
                target
            );


            const response = U.clamp(

                P.pressureTargetRelaxationPerHour *

                dtHours,

                0,

                1
            );


            this.nextPressure[i] = U.lerp(

                A.pressureHpa[i],

                target,

                response
            );
        }


        A.pressureHpa.set(
            this.nextPressure
        );


        diffuse(

            A.pressureHpa,

            this.nx,

            this.ny,

            P.pressureDiffusionPerHour *
            dtHours,

            C.grid.minPressureHpa,

            C.grid.maxPressureHpa
        );
    }


    /* ========================================================================
       WIND
       ======================================================================== */

    _updateWind(
        dtHours
    ) {

        const A = (
            this.atmosphere
        );


        const dragLand = setting(

            C.atmosphere,

            "surfaceDragLand",

            0.055
        );


        const dragSea = setting(

            C.atmosphere,

            "surfaceDragSea",

            0.020
        );


        for (
            let y = 0;
            y <
            this.ny;
            y++
        ) {

            for (
                let x = 0;
                x <
                this.nx;
                x++
            ) {

                const i = (
                    idx(
                        x,
                        y,
                        this.nx
                    )
                );


                const lat = (
                    this.terrain.lat[i]
                );


                const lon = (
                    this.terrain.lon[i]
                );


                const dpdx = gradientX(

                    A.pressureHpa,

                    x,

                    y,

                    this.terrain
                );


                const dpdy = gradientY(

                    A.pressureHpa,

                    x,

                    y,

                    this.terrain
                );


                /*
                 * Approximate Northern Hemisphere geostrophic wind.
                 */

                const latitudeFactor = U.clamp(

                    Math.sin(

                        Math.max(
                            25,
                            lat
                        ) *

                        U.DEG
                    ),

                    0.30,

                    1
                );


                const geostrophicScale = (

                    P.pressureGradientWindFactor /

                    latitudeFactor
                );


                const pressureU = (

                    -dpdy *

                    geostrophicScale
                );


                const pressureV = (

                    dpdx *

                    geostrophicScale
                );


                let targetU = (
                    pressureU
                );


                let targetV = (
                    pressureV
                );


                /* ============================================================
                   SYNOPTIC GUIDANCE
                   ============================================================ */

                if (
                    this.synoptic &&
                    typeof this.synoptic.guidanceWindAt ===
                    "function"
                ) {

                    const guidance = (
                        this.synoptic.guidanceWindAt(
                            lat,
                            lon
                        )
                    );


                    if (
                        guidance
                    ) {

                        targetU += (
                            Number(
                                guidance.u
                            ) ||
                            0
                        );


                        targetV += (
                            Number(
                                guidance.v
                            ) ||
                            0
                        );
                    }
                }


                /* ============================================================
                   BACKGROUND WESTERLIES
                   ============================================================ */

                if (
                    lat >= 38 &&
                    lat <= 68
                ) {

                    const westerlyFactor = U.clamp(

                        1 -

                        Math.abs(
                            lat - 53
                        ) /
                        18,

                        0,

                        1
                    );


                    targetU += (

                        P.backgroundWesterlyMs *

                        westerlyFactor
                    );
                }


                const response = U.clamp(

                    P.synopticWindResponsePerHour *

                    dtHours,

                    0,

                    1
                );


                let newU = U.lerp(

                    A.windU[i],

                    targetU,

                    response
                );


                let newV = U.lerp(

                    A.windV[i],

                    targetV,

                    response
                );


                /* ============================================================
                   SURFACE FRICTION
                   ============================================================ */

                const land = (
                    this.terrain.land[i]
                );


                const dragPerHour = U.lerp(

                    dragSea,

                    dragLand,

                    land
                );


                const drag = U.clamp(

                    dragPerHour *

                    dtHours,

                    0,

                    0.5
                );


                newU *= (
                    1 -
                    drag
                );


                newV *= (
                    1 -
                    drag
                );


                /* ============================================================
                   WIND SAFETY LIMIT
                   ============================================================ */

                const speed = Math.hypot(
                    newU,
                    newV
                );


                if (
                    speed >
                    C.grid.maxWindMs
                ) {

                    const scale = (

                        C.grid.maxWindMs /

                        speed
                    );


                    newU *= (
                        scale
                    );


                    newV *= (
                        scale
                    );
                }


                this.nextWindU[i] = (
                    newU
                );


                this.nextWindV[i] = (
                    newV
                );
            }
        }


        A.windU.set(
            this.nextWindU
        );


        A.windV.set(
            this.nextWindV
        );


        diffuse(

            A.windU,

            this.nx,

            this.ny,

            P.windDiffusionPerHour *
            dtHours,

            -C.grid.maxWindMs,

            C.grid.maxWindMs
        );


        diffuse(

            A.windV,

            this.nx,

            this.ny,

            P.windDiffusionPerHour *
            dtHours,

            -C.grid.maxWindMs,

            C.grid.maxWindMs
        );
    }


    /* ========================================================================
       SEMI-LAGRANGIAN ADVECTION
       ======================================================================== */

    _advect(
        dtHours
    ) {

        const A = (
            this.atmosphere
        );


        const oldTemperature =
            new Float32Array(
                A.temperatureC
            );


        const oldHumidity =
            new Float32Array(
                A.specificHumidity
            );


        const oldCloudWater =
            new Float32Array(
                A.cloudWater
            );


        const oldCloudFraction =
            new Float32Array(
                A.cloudFraction
            );


        const oldTracers =
            new Float32Array(
                A.airMassTracer
            );


        for (
            let y = 0;
            y <
            this.ny;
            y++
        ) {

            const spacing = (
                getGridSpacing(
                    this.terrain,
                    y
                )
            );


            for (
                let x = 0;
                x <
                this.nx;
                x++
            ) {

                const i = (
                    idx(
                        x,
                        y,
                        this.nx
                    )
                );


                const u = (
                    A.windU[i]
                );


                const v = (
                    A.windV[i]
                );


                /*
                 * m/s × hours × 3.6 = km
                 */

                const travelEastKm = (

                    u *

                    dtHours *

                    3.6
                );


                const travelNorthKm = (

                    v *

                    dtHours *

                    3.6
                );


                let dxCells = (

                    travelEastKm /

                    Math.max(
                        1,
                        spacing.dxKm
                    )
                );


                let dyCells = (

                    -travelNorthKm /

                    Math.max(
                        1,
                        spacing.dyKm
                    )
                );


                dxCells = U.clamp(

                    dxCells,

                    -P.maximumBacktraceCells,

                    P.maximumBacktraceCells
                );


                dyCells = U.clamp(

                    dyCells,

                    -P.maximumBacktraceCells,

                    P.maximumBacktraceCells
                );


                const sourceX = clampGridX(

                    x -
                    dxCells,

                    this.nx
                );


                const sourceY = clampGridY(

                    y -
                    dyCells,

                    this.ny
                );


                this.nextTemperature[i] = bilinearSample(

                    oldTemperature,

                    this.nx,

                    this.ny,

                    sourceX,

                    sourceY
                );


                this.nextHumidity[i] = bilinearSample(

                    oldHumidity,

                    this.nx,

                    this.ny,

                    sourceX,

                    sourceY
                );


                this.nextCloudWater[i] = bilinearSample(

                    oldCloudWater,

                    this.nx,

                    this.ny,

                    sourceX,

                    sourceY
                );


                this.nextCloudFraction[i] = bilinearSample(

                    oldCloudFraction,

                    this.nx,

                    this.ny,

                    sourceX,

                    sourceY
                );


                for (
                    let k = 0;
                    k <
                    AIR_MASS_COUNT;
                    k++
                ) {

                    this.nextAirMassTracer[
                        i *
                        AIR_MASS_COUNT +
                        k
                    ] = this._bilinearTracer(

                        oldTracers,

                        sourceX,

                        sourceY,

                        k
                    );
                }
            }
        }


        A.temperatureC.set(
            this.nextTemperature
        );


        A.specificHumidity.set(
            this.nextHumidity
        );


        A.cloudWater.set(
            this.nextCloudWater
        );


        A.cloudFraction.set(
            this.nextCloudFraction
        );


        A.airMassTracer.set(
            this.nextAirMassTracer
        );


        for (
            let i = 0;
            i <
            this.n;
            i++
        ) {

            A.normalizeAirMassTracer(
                i
            );
        }
    }


    /* ========================================================================
       TRACER INTERPOLATION
       ======================================================================== */

    _bilinearTracer(
        tracerField,
        x,
        y,
        tracerIndex
    ) {

        x = U.clamp(
            x,
            0,
            this.nx - 1
        );


        y = U.clamp(
            y,
            0,
            this.ny - 1
        );


        const x0 = Math.floor(
            x
        );


        const y0 = Math.floor(
            y
        );


        const x1 = Math.min(
            this.nx - 1,
            x0 + 1
        );


        const y1 = Math.min(
            this.ny - 1,
            y0 + 1
        );


        const tx = (
            x -
            x0
        );


        const ty = (
            y -
            y0
        );


        const get = (
            gx,
            gy
        ) => {

            const cell = (
                idx(
                    gx,
                    gy,
                    this.nx
                )
            );


            return tracerField[
                cell *
                AIR_MASS_COUNT +
                tracerIndex
            ];
        };


        const top = U.lerp(

            get(
                x0,
                y0
            ),

            get(
                x1,
                y0
            ),

            tx
        );


        const bottom = U.lerp(

            get(
                x0,
                y1
            ),

            get(
                x1,
                y1
            ),

            tx
        );


        return U.lerp(

            top,

            bottom,

            ty
        );
    }


    /* ========================================================================
       SURFACE PHYSICS
       ======================================================================== */

    _surfacePhysics(
        date,
        dtHours
    ) {

        const A = (
            this.atmosphere
        );


        for (
            let i = 0;
            i <
            this.n;
            i++
        ) {

            const lat = (
                this.terrain.lat[i]
            );


            const lon = (
                this.terrain.lon[i]
            );


            const land = (
                this.terrain.land[i]
            );


            const solar = solarFactor(

                lat,

                lon,

                date
            );


            const cloud = U.clamp(

                A.cloudFraction[i],

                0,

                1
            );


            const windSpeed = Math.hypot(

                A.windU[i],

                A.windV[i]
            );


            if (
                land >=
                0.5
            ) {

                this._landSurfacePhysics(

                    i,

                    solar,

                    cloud,

                    windSpeed,

                    dtHours
                );
            }

            else {

                this._seaSurfacePhysics(

                    i,

                    cloud,

                    windSpeed,

                    dtHours
                );
            }
        }
    }


    /* ========================================================================
       LAND SURFACE
       ======================================================================== */

    _landSurfacePhysics(
        i,
        solar,
        cloud,
        windSpeed,
        dtHours
    ) {

        const A = (
            this.atmosphere
        );


        let ground = (
            A.groundTemperatureC[i]
        );


        const air = (
            A.temperatureC[i]
        );


        const snowDepth = (
            A.snowDepthCm[i]
        );


        /* ====================================================================
           DAYTIME
           ==================================================================== */

        if (
            solar > 0
        ) {

            const cloudTransmission = U.lerp(

                1,

                P.cloudyDayHeatingMultiplier,

                cloud
            );


            const snowFactor = (

                snowDepth >
                0.5

                    ? P.snowSolarReduction

                    : 1
            );


            ground += (

                P.daylightGroundHeatingCPerHour *

                solar *

                cloudTransmission *

                snowFactor *

                dtHours
            );
        }

        else {

            /* =================================================================
               NIGHT

               Cloud substantially suppresses radiative cooling.
               ================================================================= */

            const cloudCoolingFactor = U.lerp(

                1,

                P.cloudyNightCoolingMultiplier,

                cloud
            );


            ground -= (

                P.nighttimeGroundCoolingCPerHour *

                cloudCoolingFactor *

                dtHours
            );
        }


        /*
         * Deep ground / seasonal context.
         */

        const climate = (
            A.climatologyC[i]
        );


        ground += (

            (
                climate -
                ground
            ) *

            P.groundResponsePerHour *

            dtHours
        );


        /*
         * Boundary-layer coupling.
         */

        const mixingBoost = (

            1 +

            Math.min(
                20,
                windSpeed
            ) *

            0.025
        );


        const exchange = U.clamp(

            P.landAirExchangePerHour *

            mixingBoost *

            dtHours,

            0,

            0.35
        );


        const newAir = U.lerp(

            air,

            ground,

            exchange
        );


        A.temperatureC[i] = U.clamp(

            newAir,

            P.minimumTemperatureC,

            P.maximumTemperatureC
        );


        ground += (

            (
                air -
                ground
            ) *

            P.groundAirCouplingPerHour *

            dtHours
        );


        A.groundTemperatureC[i] = U.clamp(

            ground,

            P.minimumTemperatureC,

            P.maximumTemperatureC +
            15
        );


        /* ====================================================================
           WET-SURFACE EVAPORATION
           ==================================================================== */

        if (
            A.surfaceWetness[i] >
            0
        ) {

            const saturation = (
                U.qsatFromTempPressure(

                    A.temperatureC[i],

                    A.pressureHpa[i]
                )
            );


            const deficit = Math.max(

                0,

                saturation -
                A.specificHumidity[i]
            );


            const evaporation = (

                deficit *

                A.surfaceWetness[i] *

                P.wetLandEvaporationPerHour *

                (
                    1 +
                    windSpeed *
                    0.025
                ) *

                dtHours
            );


            A.specificHumidity[i] = U.clamp(

                A.specificHumidity[i] +
                evaporation,

                0,

                P.maximumSpecificHumidity
            );
        }
    }


    /* ========================================================================
       SEA SURFACE
       ======================================================================== */

    _seaSurfacePhysics(
        i,
        cloud,
        windSpeed,
        dtHours
    ) {

        const A = (
            this.atmosphere
        );


        if (
            !this.ocean
        ) {

            return;
        }


        const sst = (
            this.ocean.sst[i]
        );


        if (
            !Number.isFinite(
                sst
            )
        ) {

            return;
        }


        const air = (
            A.temperatureC[i]
        );


        /* ====================================================================
           PROCESS-BASED AIR-SEA HEAT EXCHANGE
           ==================================================================== */

        let heatPotential = 0;


        if (
            global.EuropaOcean &&
            typeof global.EuropaOcean.airSeaHeatFluxPotential ===
            "function"
        ) {

            heatPotential = Number(

                global.EuropaOcean.airSeaHeatFluxPotential(

                    sst,

                    air,

                    windSpeed
                )

            ) || 0;
        }


        const exchangeStrength = U.clamp(

            P.seaAirExchangePerHour *

            (
                1 +

                Math.min(
                    30,
                    windSpeed
                ) *

                0.025
            ) *

            dtHours,

            0,

            0.55
        );


        let temperature = U.lerp(

            air,

            sst,

            exchangeStrength
        );


        temperature += (

            heatPotential *

            dtHours *

            0.12
        );


        A.temperatureC[i] = U.clamp(

            temperature,

            P.minimumTemperatureC,

            P.maximumTemperatureC
        );


        /* ====================================================================
           EVAPORATION
           ==================================================================== */

        const rh = U.relativeHumidity(

            A.temperatureC[i],

            A.pressureHpa[i],

            A.specificHumidity[i]
        );


        let evaporationPotential = 1;


        if (
            global.EuropaOcean &&
            typeof global.EuropaOcean.evaporationPotential ===
            "function"
        ) {

            evaporationPotential = Number(

                global.EuropaOcean.evaporationPotential(

                    sst,

                    A.temperatureC[i],

                    rh,

                    windSpeed
                )

            );


            if (
                !Number.isFinite(
                    evaporationPotential
                )
            ) {

                evaporationPotential = (
                    1
                );
            }
        }


        const saturation = (
            U.qsatFromTempPressure(

                sst,

                A.pressureHpa[i]
            )
        );


        const moistureDeficit = Math.max(

            0,

            saturation -
            A.specificHumidity[i]
        );


        const evaporation = (

            moistureDeficit *

            evaporationPotential *

            P.seaEvaporationPerHour *

            dtHours
        );


        A.specificHumidity[i] = U.clamp(

            A.specificHumidity[i] +
            evaporation,

            0,

            P.maximumSpecificHumidity
        );


        A.groundTemperatureC[i] = (
            sst
        );
    }


    /* ========================================================================
       AIR-MASS HISTORY
       ======================================================================== */

    _updateAirMassHistory(
        dtHours
    ) {

        const A = (
            this.atmosphere
        );


        for (
            let i = 0;
            i <
            this.n;
            i++
        ) {

            const land = (
                this.terrain.land[i]
            );


            A.airMassAgeHours[i] += (
                dtHours
            );


            if (
                land <
                0.5
            ) {

                A.lastSeaContactHours[i] = (
                    0
                );


                A.lastLandContactHours[i] = Math.min(

                    999,

                    A.lastLandContactHours[i] +
                    dtHours
                );


                const base = (

                    i *

                    AIR_MASS_COUNT
                );


                const adjustment = U.clamp(

                    P.maritimeTracerConversionPerHour *

                    dtHours,

                    0,

                    0.15
                );


                let targetTracer = (
                    AIR_MASS.ATLANTIC
                );


                const lat = (
                    this.terrain.lat[i]
                );


                const lon = (
                    this.terrain.lon[i]
                );


                if (
                    lat >=
                    66
                ) {

                    targetTracer = (
                        AIR_MASS.ARCTIC
                    );
                }

                else if (
                    lon >= 12 &&
                    lon <= 30 &&
                    lat >= 53 &&
                    lat <= 66
                ) {

                    targetTracer = (
                        AIR_MASS.BALTIC
                    );
                }

                else if (
                    lat <= 44 &&
                    lon >= -6 &&
                    lon <= 40
                ) {

                    targetTracer = (
                        AIR_MASS.MEDITERRANEAN
                    );
                }


                for (
                    let k = 0;
                    k <
                    AIR_MASS_COUNT;
                    k++
                ) {

                    const tracerIndex = (

                        base +
                        k
                    );


                    if (
                        k ===
                        targetTracer
                    ) {

                        A.airMassTracer[
                            tracerIndex
                        ] += (
                            adjustment
                        );
                    }

                    else {

                        A.airMassTracer[
                            tracerIndex
                        ] *= (

                            1 -

                            adjustment *
                            0.30
                        );
                    }
                }


                A.normalizeAirMassTracer(
                    i
                );
            }

            else {

                A.lastLandContactHours[i] = (
                    0
                );


                A.lastSeaContactHours[i] = Math.min(

                    999,

                    A.lastSeaContactHours[i] +
                    dtHours
                );


                const base = (

                    i *

                    AIR_MASS_COUNT
                );


                const continentality = (

                    this.terrain.continental

                        ? this.terrain.continental[i]

                        : 0.5
                );


                const adjustment = U.clamp(

                    P.landTracerConversionPerHour *

                    continentality *

                    dtHours,

                    0,

                    0.08
                );


                A.airMassTracer[
                    base +
                    AIR_MASS.CONTINENTAL
                ] += (
                    adjustment
                );


                A.normalizeAirMassTracer(
                    i
                );
            }
        }
    }


    /* ========================================================================
       ATMOSPHERIC DYNAMICS
       ======================================================================== */

    _calculateDynamics(
        dtHours
    ) {

        const A = (
            this.atmosphere
        );


        const mixingLand = setting(

            C.atmosphere,

            "mixingRateLand",

            0.055
        );


        const mixingSea = setting(

            C.atmosphere,

            "mixingRateSea",

            0.040
        );


        for (
            let y = 0;
            y <
            this.ny;
            y++
        ) {

            for (
                let x = 0;
                x <
                this.nx;
                x++
            ) {

                const i = (
                    idx(
                        x,
                        y,
                        this.nx
                    )
                );


                /* ============================================================
                   CONVERGENCE
                   ============================================================ */

                const dudx = gradientX(

                    A.windU,

                    x,

                    y,

                    this.terrain
                );


                const dvdy = gradientY(

                    A.windV,

                    x,

                    y,

                    this.terrain
                );


                const divergence = (

                    dudx +
                    dvdy
                );


                const convergence = U.clamp(

                    -divergence *

                    P.convergenceScale,

                    -1,

                    1
                );


                A.convergence[i] = (
                    convergence
                );


                /* ============================================================
                   FRONTAL GRADIENT
                   ============================================================ */

                const dTdx = gradientX(

                    A.temperatureC,

                    x,

                    y,

                    this.terrain
                );


                const dTdy = gradientY(

                    A.temperatureC,

                    x,

                    y,

                    this.terrain
                );


                const thermalGradient = Math.hypot(

                    dTdx,

                    dTdy
                );


                const frontStrength = U.clamp(

                    thermalGradient *

                    P.temperatureGradientScale *

                    (
                        0.35 +

                        Math.max(
                            0,
                            convergence
                        ) *

                        0.90
                    ),

                    0,

                    1
                );


                A.frontStrength[i] = (
                    frontStrength
                );


                /* ============================================================
                   OROGRAPHIC UPLIFT
                   ============================================================ */

                const dZdx = gradientX(

                    this.terrain.altitudeM,

                    x,

                    y,

                    this.terrain
                );


                const dZdy = gradientY(

                    this.terrain.altitudeM,

                    x,

                    y,

                    this.terrain
                );


                const upslope = Math.max(

                    0,

                    A.windU[i] *
                    dZdx +

                    A.windV[i] *
                    dZdy
                );


                const orographicLift = U.clamp(

                    upslope /
                    350,

                    0,

                    1
                );


                /* ============================================================
                   SURFACE INSTABILITY
                   ============================================================ */

                const surfaceDifference = (

                    A.groundTemperatureC[i] -

                    A.temperatureC[i]
                );


                const thermalLift = U.clamp(

                    surfaceDifference /
                    8,

                    0,

                    1
                );


                /* ============================================================
                   VERTICAL MOTION
                   ============================================================ */

                const targetVerticalMotion = (

                    Math.max(
                        0,
                        convergence
                    ) *

                    P.convergenceLiftScale +

                    frontStrength *

                    P.frontalLiftScale +

                    orographicLift *

                    P.orographicLiftScale +

                    thermalLift *

                    P.thermalLiftScale
                );


                const response = U.clamp(

                    1 -

                    Math.exp(
                        -2.5 *
                        dtHours
                    ),

                    0,

                    1
                );


                const decayedExisting = (

                    A.verticalMotion[i] *

                    Math.max(

                        0,

                        1 -

                        P.verticalMotionDecayPerHour *

                        dtHours
                    )
                );


                A.verticalMotion[i] = U.lerp(

                    decayedExisting,

                    targetVerticalMotion,

                    response
                );


                A.verticalMotion[i] = U.clamp(

                    A.verticalMotion[i],

                    0,

                    2.5
                );


                /* ============================================================
                   STABILITY
                   ============================================================ */

                A.stability[i] = U.clamp(

                    0.5 -

                    surfaceDifference *
                    0.045 +

                    A.cloudFraction[i] *
                    0.12,

                    0,

                    1
                );


                /* ============================================================
                   BOUNDARY-LAYER MIXING

                   Corrected missing constants now defined above.
                   ============================================================ */

                const baseMixing = (

                    this.terrain.land[i] >=
                    0.5

                        ? mixingLand

                        : mixingSea
                );


                const instabilityBoost = U.lerp(

                    P.unstableMixingBoost,

                    P.stableMixingReduction,

                    A.stability[i]
                );


                A.boundaryLayerMixing[i] = U.clamp(

                    baseMixing *

                    instabilityBoost,

                    0.005,

                    0.20
                );
            }
        }
    }


    /* ========================================================================
       MOISTURE / CLOUD / PRECIPITATION
       ======================================================================== */

    _moisturePhysics(
        dtHours
    ) {

        const A = (
            this.atmosphere
        );


        const condensationRate = setting(

            C.moisture,

            "condensationRate",

            0.70
        );


        for (
            let i = 0;
            i <
            this.n;
            i++
        ) {

            const temperature = (
                A.temperatureC[i]
            );


            const pressure = (
                A.pressureHpa[i]
            );


            const qsat = (
                U.qsatFromTempPressure(

                    temperature,

                    pressure
                )
            );


            let q = (
                A.specificHumidity[i]
            );


            let cloudWater = (
                A.cloudWater[i]
            );


            let cloudFraction = (
                A.cloudFraction[i]
            );


            const lift = U.clamp(

                A.verticalMotion[i],

                0,

                2.5
            );


            /*
             * Rising air reaches saturation slightly sooner.
             */

            const effectiveSaturation = (

                qsat *

                (
                    1 -

                    Math.min(
                        0.10,
                        lift *
                        0.035
                    )
                )
            );


            /* ================================================================
               CONDENSATION
               ================================================================ */

            if (
                q >
                effectiveSaturation
            ) {

                const excess = (

                    q -
                    effectiveSaturation
                );


                const condensation = Math.min(

                    excess,

                    excess *

                    condensationRate *

                    P.condensationEfficiency *

                    (
                        1 +
                        lift *
                        0.8
                    )
                );


                q -= (
                    condensation
                );


                cloudWater += (

                    condensation *

                    P.cloudFormationScale *

                    100
                );


                /*
                 * Simplified latent heat release.
                 */

                A.temperatureC[i] += (

                    condensation *

                    110
                );
            }


            /* ================================================================
               CLOUD EVAPORATION
               ================================================================ */

            const rh = U.relativeHumidity(

                A.temperatureC[i],

                pressure,

                q
            );


            if (
                rh <
                0.90 &&
                cloudWater >
                0
            ) {

                const evaporation = Math.min(

                    cloudWater,

                    (
                        0.90 -
                        rh
                    ) *

                    P.cloudEvaporationPerHour *

                    dtHours
                );


                cloudWater -= (
                    evaporation
                );


                q += (

                    evaporation *

                    0.001
                );


                A.temperatureC[i] -= (

                    evaporation *

                    0.035
                );
            }


            /* ================================================================
               CLOUD FRACTION
               ================================================================ */

            const humidityCloud = U.clamp(

                (
                    rh -
                    0.72
                ) /
                0.28,

                0,

                1
            );


            const liftCloud = U.clamp(

                lift /
                1.5,

                0,

                1
            );


            const waterCloud = U.clamp(

                cloudWater /
                0.35,

                0,

                1
            );


            const targetCloud = U.clamp(

                humidityCloud *
                0.50 +

                liftCloud *
                0.28 +

                waterCloud *
                0.55,

                0,

                1
            );


            const cloudResponse = U.clamp(

                1.6 *

                dtHours,

                0,

                1
            );


            cloudFraction = U.lerp(

                cloudFraction,

                targetCloud,

                cloudResponse
            );


            if (
                rh <
                0.65 &&
                lift <
                0.10
            ) {

                cloudFraction *= (

                    1 -

                    P.cloudFractionDecayPerHour *

                    dtHours
                );
            }


            cloudWater *= Math.max(

                0,

                1 -

                P.cloudWaterDecayPerHour *

                dtHours
            );


            /* ================================================================
               PRECIPITATION
               ================================================================ */

            let precipRate = (
                0
            );


            if (
                cloudWater >
                P.cloudWaterPrecipThreshold &&
                cloudFraction >
                0.35
            ) {

                const availableCloudWater = Math.max(

                    0,

                    cloudWater -
                    P.cloudWaterPrecipThreshold
                );


                const liftBoost = (

                    0.15 +

                    lift *

                    P.upliftPrecipBoost
                );


                const frontalBoost = (

                    1 +

                    A.frontStrength[i] *

                    1.5
                );


                precipRate = (

                    availableCloudWater *

                    P.precipEfficiency *

                    liftBoost *

                    frontalBoost
                );


                precipRate = U.clamp(

                    precipRate,

                    0,

                    P.maxPrecipRateMmHr
                );


                const removal = Math.min(

                    cloudWater,

                    precipRate *

                    0.006 *

                    dtHours
                );


                cloudWater -= (
                    removal
                );


                q = Math.max(

                    0,

                    q -

                    removal *
                    0.00035
                );
            }


            A.temperatureC[i] = U.clamp(

                A.temperatureC[i],

                P.minimumTemperatureC,

                P.maximumTemperatureC
            );


            A.specificHumidity[i] = U.clamp(

                q,

                0,

                P.maximumSpecificHumidity
            );


            A.cloudWater[i] = U.clamp(

                cloudWater,

                0,

                P.maximumCloudWater
            );


            A.cloudFraction[i] = U.clamp(

                cloudFraction,

                0,

                1
            );


            A.precipRateMmHr[i] = (
                precipRate
            );
        }
    }


    /* ========================================================================
       SNOW / SURFACE WATER
       ======================================================================== */

    _snowAndSurfaceWater(
        date,
        dtHours
    ) {

        const A = (
            this.atmosphere
        );


        const snowMaxC = setting(

            C.precipitationPhase,

            "snowMaxC",

            1.5
        );


        const sleetMaxC = setting(

            C.precipitationPhase,

            "sleetMaxC",

            3.0
        );


        const accumulationEfficiency = setting(

            C.snow,

            "accumulationEfficiency",

            1
        );


        const minimumPersistentDepth = setting(

            C.snow,

            "minimumPersistentDepthCm",

            0.05
        );


        for (
            let i = 0;
            i <
            this.n;
            i++
        ) {

            const land = (
                this.terrain.land[i]
            );


            if (
                land <
                0.5
            ) {

                A.snowDepthCm[i] = (
                    0
                );


                A.surfaceWetness[i] = (
                    1
                );


                continue;
            }


            const temperature = (
                A.temperatureC[i]
            );


            const precip = (
                A.precipRateMmHr[i]
            );


            let snow = (
                A.snowDepthCm[i]
            );


            let wetness = (
                A.surfaceWetness[i]
            );


            let phase = (
                PHASE.NONE
            );


            if (
                precip >
                0.005
            ) {

                if (
                    temperature <=
                    snowMaxC
                ) {

                    phase = (
                        PHASE.SNOW
                    );
                }

                else if (
                    temperature <=
                    sleetMaxC
                ) {

                    phase = (
                        PHASE.SLEET
                    );
                }

                else {

                    phase = (
                        PHASE.RAIN
                    );
                }
            }


            A.precipPhase[i] = (
                phase
            );


            /* ================================================================
               SNOW
               ================================================================ */

            if (
                phase ===
                PHASE.SNOW
            ) {

                const liquidEquivalentMm = (

                    precip *

                    dtHours
                );


                const snowCm = (

                    liquidEquivalentMm *

                    P.snowLiquidEquivalentRatio /

                    10
                );


                const thermalEfficiency = U.clamp(

                    (
                        snowMaxC +
                        1.5 -
                        temperature
                    ) /
                    3,

                    0.30,

                    1
                );


                snow += (

                    snowCm *

                    thermalEfficiency *

                    accumulationEfficiency *

                    7.5
                );


                wetness = U.clamp(

                    wetness +

                    0.01 *

                    dtHours,

                    0,

                    1
                );
            }


            /* ================================================================
               SLEET
               ================================================================ */

            else if (
                phase ===
                PHASE.SLEET
            ) {

                const liquidEquivalentMm = (

                    precip *

                    dtHours
                );


                snow += (

                    liquidEquivalentMm *

                    0.12
                );


                wetness = U.clamp(

                    wetness +

                    P.wetnessFromSleet *

                    precip *

                    dtHours,

                    0,

                    1
                );
            }


            /* ================================================================
               RAIN
               ================================================================ */

            else if (
                phase ===
                PHASE.RAIN
            ) {

                wetness = U.clamp(

                    wetness +

                    P.wetnessFromRain *

                    precip *

                    dtHours,

                    0,

                    1
                );
            }


            /* ================================================================
               MELT
               ================================================================ */

            if (
                snow >
                0
            ) {

                let melt = (

                    P.baseSnowMeltCmPerHour *

                    dtHours
                );


                if (
                    temperature >
                    0
                ) {

                    melt += (

                        temperature *

                        P.warmSnowMeltCmPerHourPerC *

                        dtHours
                    );
                }


                if (
                    phase ===
                    PHASE.RAIN
                ) {

                    melt += (

                        precip *

                        P.rainSnowMeltMultiplier *

                        dtHours
                    );
                }


                const solar = solarFactor(

                    this.terrain.lat[i],

                    this.terrain.lon[i],

                    date
                );


                if (
                    temperature >
                    -1
                ) {

                    melt += (

                        solar *

                        0.10 *

                        dtHours
                    );
                }


                snow = Math.max(

                    0,

                    snow -
                    melt
                );
            }


            /* ================================================================
               COMPACTION
               ================================================================ */

            snow *= Math.max(

                0,

                1 -

                P.snowCompactionPerHour *

                dtHours
            );


            if (
                snow <
                minimumPersistentDepth
            ) {

                snow = (
                    0
                );
            }


            /* ================================================================
               DRYING
               ================================================================ */

            if (
                phase ===
                PHASE.NONE
            ) {

                const windSpeed = Math.hypot(

                    A.windU[i],

                    A.windV[i]
                );


                const drying = (

                    P.wetnessDryingPerHour *

                    (
                        0.5 +

                        windSpeed *
                        0.04
                    ) *

                    dtHours
                );


                wetness = Math.max(

                    0,

                    wetness -
                    drying
                );
            }


            A.snowDepthCm[i] = (
                snow
            );


            A.surfaceWetness[i] = U.clamp(

                wetness,

                0,

                1
            );
        }
    }


    /* ========================================================================
       NUMERICAL MIXING
       ======================================================================== */

    _numericalMixing(
        dtHours
    ) {

        const A = (
            this.atmosphere
        );


        const temperatureDiffusion = setting(

            C.atmosphere,

            "temperatureDiffusion",

            0.018
        );


        const moistureDiffusion = setting(

            C.atmosphere,

            "moistureDiffusion",

            0.014
        );


        /*
         * Weak smoothing only.
         */

        diffuse(

            A.temperatureC,

            this.nx,

            this.ny,

            temperatureDiffusion *

            dtHours,

            P.minimumTemperatureC,

            P.maximumTemperatureC
        );


        diffuse(

            A.specificHumidity,

            this.nx,

            this.ny,

            moistureDiffusion *

            dtHours,

            0,

            P.maximumSpecificHumidity
        );


        diffuse(

            A.cloudWater,

            this.nx,

            this.ny,

            P.cloudDiffusionPerHour *

            dtHours,

            0,

            P.maximumCloudWater
        );
    }
}


/* ============================================================================
   EXPORT
============================================================================ */

global.EuropaPhysics = (
    PhysicsEngine
);


global.EuropaPhysicsConstants = (
    P
);


global.EuropaPhysicsUtilities = Object.freeze({

    getTimestep,

    solarFactor,

    solarDeclinationRad
});

})(window);
