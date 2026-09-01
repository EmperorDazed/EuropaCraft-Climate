/*
 * EuropaCraft Atmospheric Simulation
 * V10 Atmospheric State
 *
 * Persistent four-level atmospheric column:
 *
 *   surface
 *   925 hPa
 *   850 hPa
 *   700 hPa
 *
 * This module stores atmospheric state.
 *
 * It DOES NOT perform the main timestep physics.
 * Advection, pressure evolution, frontogenesis, vertical motion and
 * microphysics are handled by later V10 modules.
 */

(function (global) {
    "use strict";


    const C =
        global.EuropaConfig;

    const U =
        global.EuropaUtils;


    if (!C) {
        throw new Error(
            "EuropaCraft V10: config.js must load before europacraft-atmosphere.js"
        );
    }


    if (!U) {
        throw new Error(
            "EuropaCraft V10: europacraft-utils.js must load before europacraft-atmosphere.js"
        );
    }


    /* ================================================================
       CONSTANTS
    ================================================================ */

    const LEVEL_KEYS =
        C.vertical.levels.map(
            level => level.key
        );

    const LEVEL_COUNT =
        LEVEL_KEYS.length;

    const TRACER_NAMES =
        C.airMasses.tracerTypes.slice();

    const TRACER_COUNT =
        TRACER_NAMES.length;


    const TRACER_INDEX =
        Object.freeze(
            Object.fromEntries(
                TRACER_NAMES.map(
                    (name, index) => [
                        name,
                        index
                    ]
                )
            )
        );


    const PRECIPITATION_PHASE = Object.freeze({

        DRY: 0,

        RAIN: 1,

        SLEET: 2,

        WET_SNOW: 3,

        SNOW: 4
    });


    const PRECIPITATION_PHASE_NAMES =
        Object.freeze([
            "dry",
            "rain",
            "sleet",
            "wet snow",
            "snow"
        ]);


    const PRECIPITATION_REASON = Object.freeze({

        NONE: 0,

        FRONTAL: 1,

        OROGRAPHIC: 2,

        CONVECTIVE: 3,

        SATURATION: 4,

        MIXED_FORCING: 5,

        SANITY_FLOOR: 6
    });


    const PRECIPITATION_REASON_NAMES =
        Object.freeze([
            "none",
            "frontal",
            "orographic",
            "convective",
            "saturation",
            "mixed forcing",
            "sanity floor"
        ]);


    /* ================================================================
       SMALL HELPERS
    ================================================================ */

    function requireClimate() {

        if (
            !global.EuropaClimate ||
            typeof global.EuropaClimate.getBaselineTemperature !==
                "function" ||
            typeof global.EuropaClimate.getClimate !==
                "function"
        ) {

            throw new Error(
                "EuropaCraft V10: europacraft-climate-v3.js must load before atmospheric initialization."
            );
        }

        return global.EuropaClimate;
    }


    function localSolarHour(
        longitude,
        date
    ) {

        return U.mod(
            U.decimalHourUTC(date) +
            longitude / 15,
            24
        );
    }


    function hourlyClimatology(
        latitude,
        longitude,
        date,
        terrainSample
    ) {

        const climate =
            requireClimate();

        const baseline =
            climate.getBaselineTemperature(
                latitude,
                longitude,
                date,
                {
                    landFraction:
                        terrainSample.landFraction,

                    altitudeM:
                        terrainSample.altitudeM
                }
            );

        const hour =
            localSolarHour(
                longitude,
                date
            );

        /*
         * Land peaks in the afternoon.
         * Ocean diurnal variability is deliberately strongly reduced.
         */

        const cycle =
            Math.cos(
                2 *
                Math.PI *
                (
                    hour -
                    14.5
                ) /
                24
            );

        const land =
            U.clamp01(
                terrainSample.landFraction
            );

        const amplitude =
            baseline.diurnalRangeC *
            0.5 *
            (
                0.12 +
                0.88 * land
            );

        return (
            baseline.meanC +
            amplitude *
            cycle
        );
    }


    function climateHumidityTarget(
        normalized,
        landFraction
    ) {

        /*
         * Initial-state humidity only.
         *
         * Once V10 is running, moisture is prognostic and moves with the
         * atmosphere. These values merely give the initial atmosphere a
         * geographically sensible moisture field.
         */

        const maritime =
            (
                normalized["Atlantic"] +
                normalized["Polar Maritime"] +
                normalized["Arctic Maritime"] +
                normalized["North Sea"] +
                normalized["Baltic Maritime"] +
                normalized["Mediterranean"] +
                normalized["Black Sea"] +
                normalized["Caspian Maritime"]
            ) /
            100;

        const dryContinental =
            (
                normalized["North African"] +
                normalized["Eurasian Continental"] +
                normalized["Iberian Interior"] +
                normalized["Anatolian Interior"]
            ) /
            100;

        const polar =
            (
                normalized["Polar Maritime"] +
                normalized["Arctic Maritime"] +
                normalized["Greenland Ice-Sheet"]
            ) /
            100;

        let rh =
            0.61 +
            0.23 * maritime -
            0.18 * dryContinental +
            0.05 * polar;

        if (
            landFraction <
            0.5
        ) {
            rh +=
                0.07;
        }

        return U.clamp(
            rh,
            0.35,
            0.92
        );
    }


    function initialWindForLevel(
        latitude,
        longitude,
        levelIndex
    ) {

        /*
         * Initial broad mid-latitude circulation.
         *
         * This is deliberately weak enough that V10 pressure dynamics can
         * reorganise it but strong enough that the atmosphere does not
         * begin completely motionless.
         */

        const latitudeFactor =
            U.smoothstep(
                30,
                65,
                latitude
            );

        const upperFactor =
            1 +
            levelIndex *
            0.55;

        let u =
            (
                2.5 +
                7.0 *
                latitudeFactor
            ) *
            upperFactor;

        /*
         * Weak broad planetary-wave structure.
         */

        u +=
            1.4 *
            Math.sin(
                (
                    longitude +
                    12
                ) *
                U.DEG
            );

        let v =
            0.8 *
            Math.sin(
                (
                    longitude *
                    1.7 +
                    latitude
                ) *
                U.DEG
            );

        v *=
            upperFactor;

        return {
            u,
            v
        };
    }


    function cloudFractionFromState(
        relativeHumidity,
        cloudLiquid,
        cloudIce
    ) {

        const condensate =
            cloudLiquid +
            cloudIce;

        const humidityCloud =
            U.smoothstep(
                0.78,
                1.0,
                relativeHumidity
            );

        const condensateCloud =
            U.smoothstep(
                0.00001,
                0.00035,
                condensate
            );

        return U.clamp01(
            Math.max(
                humidityCloud *
                0.65,
                condensateCloud
            )
        );
    }


    /* ================================================================
       ATMOSPHERIC LEVEL STATE
    ================================================================ */

    class AtmosphericLevel {

        constructor(
            definition,
            cellCount,
            tracerCount
        ) {

            this.key =
                definition.key;

            this.nominalPressureHpa =
                definition.pressureHpa;

            this.approximateHeightM =
                definition.approximateHeightM;

            this.n =
                cellCount;

            this.tracerCount =
                tracerCount;


            /*
             * Prognostic thermodynamic state.
             */

            this.tempC =
                new Float32Array(
                    cellCount
                );

            this.q =
                new Float32Array(
                    cellCount
                );


            /*
             * Horizontal wind components.
             *
             * u:
             * positive eastward
             *
             * v:
             * positive northward
             */

            this.u =
                new Float32Array(
                    cellCount
                );

            this.v =
                new Float32Array(
                    cellCount
                );


            /*
             * Vertical velocity diagnostic/prognostic bridge.
             *
             * Positive = ascent.
             * Negative = subsidence.
             */

            this.w =
                new Float32Array(
                    cellCount
                );


            /*
             * Persistent condensate.
             *
             * These are mass mixing ratios in kg/kg.
             */

            this.cloudLiquid =
                new Float32Array(
                    cellCount
                );

            this.cloudIce =
                new Float32Array(
                    cellCount
                );


            /*
             * Cloud fraction is diagnostic but persisted because it is
             * used repeatedly by radiation and rendering.
             */

            this.cloudFraction =
                new Float32Array(
                    cellCount
                );


            /*
             * Thermodynamic diagnostics.
             */

            this.relativeHumidity =
                new Float32Array(
                    cellCount
                );

            this.wetBulbC =
                new Float32Array(
                    cellCount
                );

            this.saturationDeficit =
                new Float32Array(
                    cellCount
                );


            /*
             * 18 persistent source-history tracers.
             *
             * Layout:
             *
             * cell 0:
             * tracer 0 ... tracer 17
             *
             * cell 1:
             * tracer 0 ... tracer 17
             *
             * etc.
             */

            this.tracers =
                new Float32Array(
                    cellCount *
                    tracerCount
                );


            /*
             * Dominant tracer index is cached for diagnostics/rendering.
             */

            this.dominantTracer =
                new Uint8Array(
                    cellCount
                );
        }


        tracerOffset(
            cellIndex
        ) {

            return (
                cellIndex *
                this.tracerCount
            );
        }


        getTracer(
            cellIndex,
            tracerIndex
        ) {

            return this.tracers[
                this.tracerOffset(
                    cellIndex
                ) +
                tracerIndex
            ];
        }


        setTracer(
            cellIndex,
            tracerIndex,
            value
        ) {

            this.tracers[
                this.tracerOffset(
                    cellIndex
                ) +
                tracerIndex
            ] =
                Math.max(
                    0,
                    Number(value) || 0
                );
        }


        getTracerVector(
            cellIndex,
            output = null
        ) {

            const result =
                output ||
                new Float32Array(
                    this.tracerCount
                );

            const start =
                this.tracerOffset(
                    cellIndex
                );

            for (
                let tracer = 0;
                tracer < this.tracerCount;
                tracer++
            ) {

                result[
                    tracer
                ] =
                    this.tracers[
                        start +
                        tracer
                    ];
            }

            return result;
        }


        setTracerVector(
            cellIndex,
            values
        ) {

            const start =
                this.tracerOffset(
                    cellIndex
                );

            let total = 0;

            for (
                let tracer = 0;
                tracer < this.tracerCount;
                tracer++
            ) {

                const value =
                    Math.max(
                        0,
                        Number(
                            values[
                                tracer
                            ]
                        ) || 0
                    );

                this.tracers[
                    start +
                    tracer
                ] =
                    value;

                total +=
                    value;
            }


            if (
                total <= 1e-12
            ) {

                this.tracers[
                    start
                ] =
                    1;

                for (
                    let tracer = 1;
                    tracer < this.tracerCount;
                    tracer++
                ) {

                    this.tracers[
                        start +
                        tracer
                    ] =
                        0;
                }

                this.dominantTracer[
                    cellIndex
                ] =
                    0;

                return;
            }


            const inverse =
                1 /
                total;

            let dominantIndex =
                0;

            let dominantValue =
                -Infinity;

            for (
                let tracer = 0;
                tracer < this.tracerCount;
                tracer++
            ) {

                const index =
                    start +
                    tracer;

                this.tracers[
                    index
                ] *=
                    inverse;

                if (
                    this.tracers[index] >
                    dominantValue
                ) {

                    dominantValue =
                        this.tracers[
                            index
                        ];

                    dominantIndex =
                        tracer;
                }
            }

            this.dominantTracer[
                cellIndex
            ] =
                dominantIndex;
        }


        normalizeTracersAt(
            cellIndex
        ) {

            const start =
                this.tracerOffset(
                    cellIndex
                );

            let total = 0;

            for (
                let tracer = 0;
                tracer < this.tracerCount;
                tracer++
            ) {

                const index =
                    start +
                    tracer;

                const value =
                    Math.max(
                        0,
                        Number.isFinite(
                            this.tracers[
                                index
                            ]
                        )
                            ? this.tracers[
                                index
                            ]
                            : 0
                    );

                this.tracers[
                    index
                ] =
                    value;

                total +=
                    value;
            }


            if (
                total <= 1e-12
            ) {

                this.tracers[
                    start
                ] =
                    1;

                for (
                    let tracer = 1;
                    tracer < this.tracerCount;
                    tracer++
                ) {

                    this.tracers[
                        start +
                        tracer
                    ] =
                        0;
                }

                this.dominantTracer[
                    cellIndex
                ] =
                    0;

                return;
            }


            const inverse =
                1 /
                total;

            let dominantIndex =
                0;

            let dominantValue =
                -Infinity;

            for (
                let tracer = 0;
                tracer < this.tracerCount;
                tracer++
            ) {

                const index =
                    start +
                    tracer;

                this.tracers[
                    index
                ] *=
                    inverse;

                const value =
                    this.tracers[
                        index
                    ];

                if (
                    value >
                    dominantValue
                ) {

                    dominantValue =
                        value;

                    dominantIndex =
                        tracer;
                }
            }

            this.dominantTracer[
                cellIndex
            ] =
                dominantIndex;
        }


        normalizeAllTracers() {

            for (
                let i = 0;
                i < this.n;
                i++
            ) {

                this.normalizeTracersAt(
                    i
                );
            }
        }
    }


    /* ================================================================
       COMPLETE ATMOSPHERE
    ================================================================ */

    class Atmosphere {

        constructor(
            terrain,
            ocean,
            date
        ) {

            if (!terrain) {

                throw new Error(
                    "EuropaCraft V10 Atmosphere requires terrain."
                );
            }


            if (!ocean) {

                throw new Error(
                    "EuropaCraft V10 Atmosphere requires ocean state."
                );
            }


            this.terrain =
                terrain;

            this.ocean =
                ocean;

            this.nx =
                terrain.nx;

            this.ny =
                terrain.ny;

            this.n =
                terrain.n;


            /* ========================================================
               VERTICAL LEVELS
            ======================================================== */

            this.levels =
                C.vertical.levels.map(
                    definition =>
                        new AtmosphericLevel(
                            definition,
                            this.n,
                            TRACER_COUNT
                        )
                );


            this.levelByKey =
                Object.create(
                    null
                );


            for (
                const level of this.levels
            ) {

                this.levelByKey[
                    level.key
                ] =
                    level;
            }


            this.surface =
                this.levelByKey.surface;

            this.level925 =
                this.levelByKey["925"];

            this.level850 =
                this.levelByKey["850"];

            this.level700 =
                this.levelByKey["700"];


            /* ========================================================
               SURFACE PRESSURE
            ======================================================== */

            this.pressureHpa =
                new Float32Array(
                    this.n
                );

            this.pressureTendencyHpaHr =
                new Float32Array(
                    this.n
                );


            /* ========================================================
               FRONTAL / DYNAMICAL DIAGNOSTICS
            ======================================================== */

            this.convergence =
                new Float32Array(
                    this.n
                );

            this.divergence =
                new Float32Array(
                    this.n
                );

            this.vorticity =
                new Float32Array(
                    this.n
                );

            this.temperatureGradient =
                new Float32Array(
                    this.n
                );

            this.humidityGradient =
                new Float32Array(
                    this.n
                );

            this.tracerContrast =
                new Float32Array(
                    this.n
                );

            this.frontStrength =
                new Float32Array(
                    this.n
                );

            this.frontalLift =
                new Float32Array(
                    this.n
                );

            this.orographicLift =
                new Float32Array(
                    this.n
                );

            this.convectiveLift =
                new Float32Array(
                    this.n
                );

            this.totalLift =
                new Float32Array(
                    this.n
                );


            /* ========================================================
               MICROPHYSICS DIAGNOSTICS
            ======================================================== */

            this.condensationRate =
                new Float32Array(
                    this.n
                );

            this.evaporationRate =
                new Float32Array(
                    this.n
                );

            this.precipProduction =
                new Float32Array(
                    this.n
                );

            this.precipEvaporation =
                new Float32Array(
                    this.n
                );


            /* ========================================================
               SURFACE PRECIPITATION
            ======================================================== */

            this.precipMmHr =
                new Float32Array(
                    this.n
                );

            this.rainMmHr =
                new Float32Array(
                    this.n
                );

            this.sleetMmHr =
                new Float32Array(
                    this.n
                );

            this.wetSnowMmHr =
                new Float32Array(
                    this.n
                );

            this.snowMmHr =
                new Float32Array(
                    this.n
                );

            this.precipitationPhase =
                new Uint8Array(
                    this.n
                );

            this.precipitationReason =
                new Uint8Array(
                    this.n
                );


            /* ========================================================
               GROUND STATE
            ======================================================== */

            this.groundC =
                new Float32Array(
                    this.n
                );

            this.groundMoisture =
                new Float32Array(
                    this.n
                );

            this.snowDepthCm =
                new Float32Array(
                    this.n
                );

            this.snowWaterEquivalentMm =
                new Float32Array(
                    this.n
                );


            /* ========================================================
               INITIALISE
            ======================================================== */

            this.initialize(
                date instanceof Date
                    ? date
                    : new Date(date)
            );
        }


        /* ============================================================
           INITIAL ATMOSPHERE
        ============================================================ */

        initialize(
            date
        ) {

            const climateSystem =
                requireClimate();


            for (
                let i = 0;
                i < this.n;
                i++
            ) {

                const latitude =
                    this.terrain.lat[i];

                const longitude =
                    this.terrain.lon[i];

                const landFraction =
                    U.clamp01(
                        this.terrain.land[i]
                    );

                const altitudeM =
                    Math.max(
                        0,
                        this.terrain.altitudeM[i]
                    );


                const terrainSample = {

                    landFraction,

                    altitudeM,

                    maritime:
                        this.terrain.maritime
                            ? this.terrain.maritime[i]
                            : 1 - landFraction,

                    continental:
                        this.terrain.continental
                            ? this.terrain.continental[i]
                            : landFraction
                };


                const climate =
                    climateSystem.getClimate(
                        latitude,
                        longitude,
                        {
                            landFraction,

                            altitudeM
                        }
                    );


                const normalized =
                    climate.normalized;


                /* ----------------------------------------------------
                   SURFACE TEMPERATURE
                ---------------------------------------------------- */

                let surfaceTemperature =
                    hourlyClimatology(
                        latitude,
                        longitude,
                        date,
                        terrainSample
                    );


                if (
                    landFraction <
                    0.5 &&
                    this.ocean.sst
                ) {

                    /*
                     * Sea-surface air begins reasonably coupled to SST
                     * without forcing exact equality.
                     */

                    surfaceTemperature =
                        U.lerp(
                            surfaceTemperature,
                            this.ocean.sst[i],
                            0.42
                        );
                }


                this.surface.tempC[i] =
                    U.clamp(
                        surfaceTemperature,
                        C.limits.temperatureMinC,
                        C.limits.temperatureMaxC
                    );


                /* ----------------------------------------------------
                   INITIAL SURFACE PRESSURE
                ---------------------------------------------------- */

                const planetaryWave =
                    4.5 *
                    Math.sin(
                        (
                            longitude +
                            18
                        ) *
                        U.DEG
                    ) *
                    U.smoothstep(
                        35,
                        65,
                        latitude
                    );


                const subtropicalHigh =
                    5.0 *
                    Math.exp(
                        -0.5 *
                        Math.pow(
                            (
                                latitude -
                                35
                            ) /
                            8,
                            2
                        )
                    );


                const subpolarLow =
                    -5.5 *
                    Math.exp(
                        -0.5 *
                        Math.pow(
                            (
                                latitude -
                                61
                            ) /
                            9,
                            2
                        )
                    );


                this.pressureHpa[i] =
                    U.clamp(
                        1014 +
                        planetaryWave +
                        subtropicalHigh +
                        subpolarLow,
                        C.limits.pressureMinHpa,
                        C.limits.pressureMaxHpa
                    );


                /* ----------------------------------------------------
                   INITIAL MOISTURE
                ---------------------------------------------------- */

                const surfaceRH =
                    climateHumidityTarget(
                        normalized,
                        landFraction
                    );


                const surfaceQsat =
                    U.qsatFromTempPressure(
                        this.surface.tempC[i],
                        this.pressureHpa[i]
                    );


                this.surface.q[i] =
                    U.clamp(
                        surfaceQsat *
                        surfaceRH,
                        0,
                        C.limits.specificHumidityMaxKgKg
                    );


                /* ----------------------------------------------------
                   INITIAL FREE ATMOSPHERE
                ---------------------------------------------------- */

                /*
                 * Reconstruct an approximate sea-level thermal reference
                 * from the terrain-adjusted surface temperature.
                 */

                const seaLevelEquivalentTemperature =
                    this.surface.tempC[i] +
                    C.vertical.environmentalLapseRateCPerKm *
                    altitudeM /
                    1000;


                for (
                    let levelIndex = 0;
                    levelIndex < LEVEL_COUNT;
                    levelIndex++
                ) {

                    const level =
                        this.levels[
                            levelIndex
                        ];


                    /* ----------------------------------------------
                       AIR-MASS TRACERS
                    ---------------------------------------------- */

                    const tracerVector =
                        new Float32Array(
                            TRACER_COUNT
                        );


                    for (
                        let tracerIndex = 0;
                        tracerIndex < TRACER_COUNT;
                        tracerIndex++
                    ) {

                        const tracerName =
                            TRACER_NAMES[
                                tracerIndex
                            ];

                        tracerVector[
                            tracerIndex
                        ] =
                            Math.max(
                                0,
                                (
                                    normalized[
                                        tracerName
                                    ] ||
                                    0
                                ) /
                                100
                            );
                    }


                    level.setTracerVector(
                        i,
                        tracerVector
                    );


                    if (
                        levelIndex === 0
                    ) {

                        const wind =
                            initialWindForLevel(
                                latitude,
                                longitude,
                                levelIndex
                            );

                        level.u[i] =
                            wind.u;

                        level.v[i] =
                            wind.v;

                        continue;
                    }


                    const heightM =
                        level.approximateHeightM;


                    let temperature =
                        seaLevelEquivalentTemperature -
                        C.vertical.environmentalLapseRateCPerKm *
                        heightM /
                        1000;


                    /*
                     * Mild initial free-atmosphere wave structure.
                     */

                    temperature +=
                        0.8 *
                        Math.sin(
                            (
                                longitude *
                                1.5 +
                                latitude
                            ) *
                            U.DEG
                        ) *
                        (
                            levelIndex /
                            3
                        );


                    level.tempC[i] =
                        U.clamp(
                            temperature,
                            C.limits.temperatureMinC,
                            C.limits.temperatureMaxC
                        );


                    const pressure =
                        level.nominalPressureHpa;


                    /*
                     * Free atmosphere becomes progressively less humid.
                     */

                    const humidityReduction =
                        levelIndex === 1
                            ? 0.05
                            : levelIndex === 2
                                ? 0.12
                                : 0.22;


                    const levelRH =
                        U.clamp(
                            surfaceRH -
                            humidityReduction,
                            0.25,
                            0.88
                        );


                    level.q[i] =
                        U.clamp(
                            U.qsatFromTempPressure(
                                level.tempC[i],
                                pressure
                            ) *
                            levelRH,
                            0,
                            C.limits.specificHumidityMaxKgKg
                        );


                    const wind =
                        initialWindForLevel(
                            latitude,
                            longitude,
                            levelIndex
                        );


                    level.u[i] =
                        wind.u;

                    level.v[i] =
                        wind.v;
                }


                /* ----------------------------------------------------
                   INITIAL CLOUD STATE
                ---------------------------------------------------- */

                for (
                    let levelIndex = 0;
                    levelIndex < LEVEL_COUNT;
                    levelIndex++
                ) {

                    const level =
                        this.levels[
                            levelIndex
                        ];

                    const pressure =
                        levelIndex === 0
                            ? this.pressureHpa[i]
                            : level.nominalPressureHpa;


                    const rh =
                        U.relativeHumidity(
                            level.tempC[i],
                            pressure,
                            level.q[i]
                        );


                    let cloudLiquid =
                        0;

                    let cloudIce =
                        0;


                    if (
                        rh >
                        0.88
                    ) {

                        const seed =
                            U.smoothstep(
                                0.88,
                                1.0,
                                rh
                            );


                        if (
                            level.tempC[i] >
                            -8
                        ) {

                            cloudLiquid =
                                seed *
                                0.000025;
                        }


                        if (
                            level.tempC[i] <
                            -3
                        ) {

                            cloudIce =
                                seed *
                                0.000018;
                        }
                    }


                    level.cloudLiquid[i] =
                        cloudLiquid;

                    level.cloudIce[i] =
                        cloudIce;

                    level.relativeHumidity[i] =
                        rh;

                    level.wetBulbC[i] =
                        U.wetBulbC(
                            level.tempC[i],
                            pressure,
                            level.q[i]
                        );

                    level.saturationDeficit[i] =
                        U.saturationDeficitKgKg(
                            level.tempC[i],
                            pressure,
                            level.q[i]
                        );

                    level.cloudFraction[i] =
                        cloudFractionFromState(
                            rh,
                            cloudLiquid,
                            cloudIce
                        );

                    level.w[i] =
                        0;
                }


                /* ----------------------------------------------------
                   INITIAL GROUND
                ---------------------------------------------------- */

                this.groundC[i] =
                    this.surface.tempC[i];


                this.groundMoisture[i] =
                    landFraction > 0.5
                        ? U.clamp(
                            0.42 +
                            0.28 *
                            (
                                terrainSample.maritime ||
                                0
                            ),
                            0.15,
                            0.85
                        )
                        : 1;


                this.snowDepthCm[i] =
                    0;

                this.snowWaterEquivalentMm[i] =
                    0;


                /* ----------------------------------------------------
                   INITIAL PRECIPITATION
                ---------------------------------------------------- */

                this.precipMmHr[i] =
                    0;

                this.rainMmHr[i] =
                    0;

                this.sleetMmHr[i] =
                    0;

                this.wetSnowMmHr[i] =
                    0;

                this.snowMmHr[i] =
                    0;

                this.precipitationPhase[i] =
                    PRECIPITATION_PHASE.DRY;

                this.precipitationReason[i] =
                    PRECIPITATION_REASON.NONE;
            }


            this.updateAllThermodynamicDiagnostics();
        }


        /* ============================================================
           LEVEL ACCESS
        ============================================================ */

        getLevel(
            keyOrIndex
        ) {

            if (
                typeof keyOrIndex ===
                "number"
            ) {

                return (
                    this.levels[
                        keyOrIndex
                    ] ||
                    null
                );
            }


            return (
                this.levelByKey[
                    String(
                        keyOrIndex
                    )
                ] ||
                null
            );
        }


        getLevelIndex(
            key
        ) {

            return LEVEL_KEYS.indexOf(
                String(key)
            );
        }


        pressureAt(
            levelIndex,
            cellIndex
        ) {

            if (
                levelIndex === 0
            ) {
                return this.pressureHpa[
                    cellIndex
                ];
            }


            return this.levels[
                levelIndex
            ].nominalPressureHpa;
        }


        /* ============================================================
           TRACER ACCESS
        ============================================================ */

        tracerIndex(
            tracerName
        ) {

            const index =
                TRACER_INDEX[
                    tracerName
                ];

            return (
                Number.isInteger(index)
                    ? index
                    : -1
            );
        }


        getTracerVector(
            levelKey,
            cellIndex,
            output = null
        ) {

            const level =
                this.getLevel(
                    levelKey
                );

            if (!level) {

                throw new Error(
                    "Unknown EuropaCraft atmospheric level: " +
                    levelKey
                );
            }


            return level.getTracerVector(
                cellIndex,
                output
            );
        }


        setTracerVector(
            levelKey,
            cellIndex,
            values
        ) {

            const level =
                this.getLevel(
                    levelKey
                );

            if (!level) {

                throw new Error(
                    "Unknown EuropaCraft atmospheric level: " +
                    levelKey
                );
            }


            level.setTracerVector(
                cellIndex,
                values
            );
        }


        dominantAirMassAtIndex(
            cellIndex,
            levelKey = "surface"
        ) {

            const level =
                this.getLevel(
                    levelKey
                );


            if (!level) {
                return null;
            }


            const tracerIndex =
                level.dominantTracer[
                    cellIndex
                ];


            const fraction =
                level.getTracer(
                    cellIndex,
                    tracerIndex
                );


            return {

                index:
                    tracerIndex,

                name:
                    TRACER_NAMES[
                        tracerIndex
                    ],

                fraction
            };
        }


        /* ============================================================
           THERMODYNAMIC DIAGNOSTICS
        ============================================================ */

        updateThermodynamicDiagnosticsAt(
            cellIndex
        ) {

            for (
                let levelIndex = 0;
                levelIndex < LEVEL_COUNT;
                levelIndex++
            ) {

                const level =
                    this.levels[
                        levelIndex
                    ];

                const pressure =
                    this.pressureAt(
                        levelIndex,
                        cellIndex
                    );


                const rh =
                    U.relativeHumidity(
                        level.tempC[
                            cellIndex
                        ],
                        pressure,
                        level.q[
                            cellIndex
                        ]
                    );


                level.relativeHumidity[
                    cellIndex
                ] =
                    rh;


                level.wetBulbC[
                    cellIndex
                ] =
                    U.wetBulbC(
                        level.tempC[
                            cellIndex
                        ],
                        pressure,
                        level.q[
                            cellIndex
                        ]
                    );


                level.saturationDeficit[
                    cellIndex
                ] =
                    U.saturationDeficitKgKg(
                        level.tempC[
                            cellIndex
                        ],
                        pressure,
                        level.q[
                            cellIndex
                        ]
                    );


                level.cloudFraction[
                    cellIndex
                ] =
                    cloudFractionFromState(
                        rh,
                        level.cloudLiquid[
                            cellIndex
                        ],
                        level.cloudIce[
                            cellIndex
                        ]
                    );
            }
        }


        updateAllThermodynamicDiagnostics() {

            for (
                let i = 0;
                i < this.n;
                i++
            ) {

                this.updateThermodynamicDiagnosticsAt(
                    i
                );
            }
        }


        /* ============================================================
           PRECIPITATION RESET
        ============================================================ */

        clearInstantaneousPrecipitation() {

            this.precipMmHr.fill(
                0
            );

            this.rainMmHr.fill(
                0
            );

            this.sleetMmHr.fill(
                0
            );

            this.wetSnowMmHr.fill(
                0
            );

            this.snowMmHr.fill(
                0
            );

            this.precipitationPhase.fill(
                PRECIPITATION_PHASE.DRY
            );

            this.precipitationReason.fill(
                PRECIPITATION_REASON.NONE
            );

            this.condensationRate.fill(
                0
            );

            this.evaporationRate.fill(
                0
            );

            this.precipProduction.fill(
                0
            );

            this.precipEvaporation.fill(
                0
            );
        }


        clearDynamicDiagnostics() {

            this.convergence.fill(
                0
            );

            this.divergence.fill(
                0
            );

            this.vorticity.fill(
                0
            );

            this.temperatureGradient.fill(
                0
            );

            this.humidityGradient.fill(
                0
            );

            this.tracerContrast.fill(
                0
            );

            this.frontalLift.fill(
                0
            );

            this.orographicLift.fill(
                0
            );

            this.convectiveLift.fill(
                0
            );

            this.totalLift.fill(
                0
            );
        }


        /* ============================================================
           CLIMATOLOGY
        ============================================================ */

        climatologyAtIndex(
            cellIndex,
            date
        ) {

            return hourlyClimatology(
                this.terrain.lat[
                    cellIndex
                ],
                this.terrain.lon[
                    cellIndex
                ],
                date,
                {
                    landFraction:
                        this.terrain.land[
                            cellIndex
                        ],

                    altitudeM:
                        this.terrain.altitudeM[
                            cellIndex
                        ],

                    maritime:
                        this.terrain.maritime
                            ? this.terrain.maritime[
                                cellIndex
                            ]
                            : 1 -
                              this.terrain.land[
                                  cellIndex
                              ],

                    continental:
                        this.terrain.continental
                            ? this.terrain.continental[
                                cellIndex
                            ]
                            : this.terrain.land[
                                cellIndex
                            ]
                }
            );
        }


        /* ============================================================
           MAP SAMPLING
        ============================================================ */

        _sampleArray(
            array,
            latitude,
            longitude
        ) {

            return this.terrain.sampleArray(
                array,
                latitude,
                longitude
            );
        }


        _sampleLevel(
            level,
            levelIndex,
            latitude,
            longitude
        ) {

            const tempC =
                this._sampleArray(
                    level.tempC,
                    latitude,
                    longitude
                );

            const q =
                this._sampleArray(
                    level.q,
                    latitude,
                    longitude
                );


            let pressureHpa;

            if (
                levelIndex === 0
            ) {

                pressureHpa =
                    this._sampleArray(
                        this.pressureHpa,
                        latitude,
                        longitude
                    );
            }
            else {

                pressureHpa =
                    level.nominalPressureHpa;
            }


            const u =
                this._sampleArray(
                    level.u,
                    latitude,
                    longitude
                );

            const v =
                this._sampleArray(
                    level.v,
                    latitude,
                    longitude
                );


            return {

                key:
                    level.key,

                pressureHpa,

                approximateHeightM:
                    level.approximateHeightM,

                tempC,

                qKgKg:
                    q,

                humidityPct:
                    U.clamp(
                        U.relativeHumidity(
                            tempC,
                            pressureHpa,
                            q
                        ) *
                        100,
                        0,
                        100
                    ),

                wetBulbC:
                    U.wetBulbC(
                        tempC,
                        pressureHpa,
                        q
                    ),

                cloudFraction:
                    U.clamp01(
                        this._sampleArray(
                            level.cloudFraction,
                            latitude,
                            longitude
                        )
                    ),

                cloudLiquidKgKg:
                    Math.max(
                        0,
                        this._sampleArray(
                            level.cloudLiquid,
                            latitude,
                            longitude
                        )
                    ),

                cloudIceKgKg:
                    Math.max(
                        0,
                        this._sampleArray(
                            level.cloudIce,
                            latitude,
                            longitude
                        )
                    ),

                windUMs:
                    u,

                windVMs:
                    v,

                windSpeedMs:
                    Math.hypot(
                        u,
                        v
                    ),

                windFromDeg:
                    U.meteorologicalWindFromDirection(
                        u,
                        v
                    ),

                verticalVelocity:
                    this._sampleArray(
                        level.w,
                        latitude,
                        longitude
                    )
            };
        }


        _sampleTracerMix(
            level,
            latitude,
            longitude
        ) {

            const position =
                this.terrain.xyFromLatLon(
                    latitude,
                    longitude
                );


            const result =
                new Float32Array(
                    TRACER_COUNT
                );


            /*
             * Tracer arrays are interleaved, therefore each tracer is
             * sampled explicitly. This is used by the inspector, not the
             * main physics loop.
             */

            const temporary =
                new Float32Array(
                    this.n
                );


            for (
                let tracerIndex = 0;
                tracerIndex < TRACER_COUNT;
                tracerIndex++
            ) {

                for (
                    let cell = 0;
                    cell < this.n;
                    cell++
                ) {

                    temporary[
                        cell
                    ] =
                        level.tracers[
                            cell *
                            TRACER_COUNT +
                            tracerIndex
                        ];
                }


                result[
                    tracerIndex
                ] =
                    U.bilinear(
                        temporary,
                        this.nx,
                        this.ny,
                        position.x,
                        position.y
                    );
            }


            U.normalizeWeights(
                result
            );


            const dominantIndex =
                U.dominantWeightIndex(
                    result
                );


            const ranked =
                TRACER_NAMES.map(
                    (
                        name,
                        index
                    ) => ({

                        name,

                        fraction:
                            result[
                                index
                            ]
                    })
                )
                .sort(
                    (
                        a,
                        b
                    ) =>
                        b.fraction -
                        a.fraction
                );


            return {

                dominant:
                    dominantIndex >= 0
                        ? {
                            name:
                                TRACER_NAMES[
                                    dominantIndex
                                ],

                            fraction:
                                result[
                                    dominantIndex
                                ]
                        }
                        : null,

                ranked,

                raw:
                    result
            };
        }


        sample(
            latitude,
            longitude,
            date
        ) {

            const surface =
                this._sampleLevel(
                    this.surface,
                    0,
                    latitude,
                    longitude
                );


            const level925 =
                this._sampleLevel(
                    this.level925,
                    1,
                    latitude,
                    longitude
                );


            const level850 =
                this._sampleLevel(
                    this.level850,
                    2,
                    latitude,
                    longitude
                );


            const level700 =
                this._sampleLevel(
                    this.level700,
                    3,
                    latitude,
                    longitude
                );


            const climatologyC =
                hourlyClimatology(
                    latitude,
                    longitude,
                    date,
                    this.terrain.sample(
                        latitude,
                        longitude
                    )
                );


            const tracerMix =
                this._sampleTracerMix(
                    this.surface,
                    latitude,
                    longitude
                );


            const phaseCode =
                Math.round(
                    this._sampleArray(
                        this.precipitationPhase,
                        latitude,
                        longitude
                    )
                );


            const reasonCode =
                Math.round(
                    this._sampleArray(
                        this.precipitationReason,
                        latitude,
                        longitude
                    )
                );


            return {

                lat:
                    latitude,

                lon:
                    longitude,


                /* --------------------------------------------------
                   SURFACE WEATHER
                -------------------------------------------------- */

                tempC:
                    surface.tempC,

                climatologyC,

                anomalyC:
                    surface.tempC -
                    climatologyC,

                pressureHpa:
                    surface.pressureHpa,

                humidityPct:
                    surface.humidityPct,

                wetBulbC:
                    surface.wetBulbC,

                qKgKg:
                    surface.qKgKg,

                windUMs:
                    surface.windUMs,

                windVMs:
                    surface.windVMs,

                windSpeedMs:
                    surface.windSpeedMs,

                windFromDeg:
                    surface.windFromDeg,

                cloudFraction:
                    surface.cloudFraction,


                /* --------------------------------------------------
                   PRECIPITATION
                -------------------------------------------------- */

                precipMmHr:
                    Math.max(
                        0,
                        this._sampleArray(
                            this.precipMmHr,
                            latitude,
                            longitude
                        )
                    ),

                rainMmHr:
                    Math.max(
                        0,
                        this._sampleArray(
                            this.rainMmHr,
                            latitude,
                            longitude
                        )
                    ),

                sleetMmHr:
                    Math.max(
                        0,
                        this._sampleArray(
                            this.sleetMmHr,
                            latitude,
                            longitude
                        )
                    ),

                wetSnowMmHr:
                    Math.max(
                        0,
                        this._sampleArray(
                            this.wetSnowMmHr,
                            latitude,
                            longitude
                        )
                    ),

                snowMmHr:
                    Math.max(
                        0,
                        this._sampleArray(
                            this.snowMmHr,
                            latitude,
                            longitude
                        )
                    ),

                precipitationType:
                    PRECIPITATION_PHASE_NAMES[
                        phaseCode
                    ] ||
                    "dry",

                precipitationReason:
                    PRECIPITATION_REASON_NAMES[
                        reasonCode
                    ] ||
                    "none",


                /* --------------------------------------------------
                   GROUND
                -------------------------------------------------- */

                groundC:
                    this._sampleArray(
                        this.groundC,
                        latitude,
                        longitude
                    ),

                groundMoisture:
                    this._sampleArray(
                        this.groundMoisture,
                        latitude,
                        longitude
                    ),

                snowDepthCm:
                    Math.max(
                        0,
                        this._sampleArray(
                            this.snowDepthCm,
                            latitude,
                            longitude
                        )
                    ),

                snowWaterEquivalentMm:
                    Math.max(
                        0,
                        this._sampleArray(
                            this.snowWaterEquivalentMm,
                            latitude,
                            longitude
                        )
                    ),


                /* --------------------------------------------------
                   DYNAMICS
                -------------------------------------------------- */

                convergence:
                    this._sampleArray(
                        this.convergence,
                        latitude,
                        longitude
                    ),

                frontStrength:
                    this._sampleArray(
                        this.frontStrength,
                        latitude,
                        longitude
                    ),

                frontalLift:
                    this._sampleArray(
                        this.frontalLift,
                        latitude,
                        longitude
                    ),

                orographicLift:
                    this._sampleArray(
                        this.orographicLift,
                        latitude,
                        longitude
                    ),

                convectiveLift:
                    this._sampleArray(
                        this.convectiveLift,
                        latitude,
                        longitude
                    ),

                totalLift:
                    this._sampleArray(
                        this.totalLift,
                        latitude,
                        longitude
                    ),

                tracerContrast:
                    this._sampleArray(
                        this.tracerContrast,
                        latitude,
                        longitude
                    ),


                /* --------------------------------------------------
                   AIR MASS
                -------------------------------------------------- */

                airMass:
                    tracerMix,


                /* --------------------------------------------------
                   VERTICAL COLUMN
                -------------------------------------------------- */

                levels: {

                    surface,

                    "925":
                        level925,

                    "850":
                        level850,

                    "700":
                        level700
                },


                terrain:
                    this.terrain.sample(
                        latitude,
                        longitude
                    ),


                sstC:
                    this.ocean.sample
                        ? this.ocean.sample(
                            latitude,
                            longitude
                        )
                        : this._sampleArray(
                            this.ocean.sst,
                            latitude,
                            longitude
                        )
            };
        }


        /* ============================================================
           NUMERICAL VALIDATION
        ============================================================ */

        validate() {

            U.assertFiniteArray(
                this.pressureHpa,
                "surface pressure"
            );


            for (
                const level of this.levels
            ) {

                U.assertFiniteArray(
                    level.tempC,
                    level.key +
                    " temperature"
                );

                U.assertFiniteArray(
                    level.q,
                    level.key +
                    " specific humidity"
                );

                U.assertFiniteArray(
                    level.u,
                    level.key +
                    " wind u"
                );

                U.assertFiniteArray(
                    level.v,
                    level.key +
                    " wind v"
                );

                U.assertFiniteArray(
                    level.cloudLiquid,
                    level.key +
                    " cloud liquid"
                );

                U.assertFiniteArray(
                    level.cloudIce,
                    level.key +
                    " cloud ice"
                );

                U.assertFiniteArray(
                    level.tracers,
                    level.key +
                    " air-mass tracers"
                );
            }


            return true;
        }
    }


    /* ================================================================
       EXPORT
    ================================================================ */

    global.EuropaAtmosphere =
        Object.freeze({

            Atmosphere,

            AtmosphericLevel,

            LEVEL_KEYS:
                Object.freeze(
                    LEVEL_KEYS.slice()
                ),

            TRACER_NAMES:
                Object.freeze(
                    TRACER_NAMES.slice()
                ),

            TRACER_INDEX,

            PRECIPITATION_PHASE,

            PRECIPITATION_PHASE_NAMES,

            PRECIPITATION_REASON,

            PRECIPITATION_REASON_NAMES,

            hourlyClimatology
        });

})(window);
