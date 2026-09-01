/*
 * EuropaCraft Atmospheric Simulation
 * V10 Physics Engine
 *
 * Core atmospheric dynamics.
 *
 * Every call advances the actual prognostic atmosphere.
 *
 * Main sequence:
 *
 *   1. Advect pressure and four atmospheric levels
 *   2. Advect all 18 air-mass tracers
 *   3. Apply weak numerical diffusion
 *   4. Maintain physically open/climatological boundaries
 *   5. Evolve prognostic surface pressure
 *   6. Derive winds from pressure gradients
 *   7. Apply user steering momentum
 *   8. Diagnose convergence / divergence / vorticity
 *   9. Detect air-mass boundaries and fronts
 *  10. Calculate frontal ascent
 *  11. Calculate orographic ascent
 *  12. Calculate convective ascent
 *  13. Construct vertical motion through 925/850/700 hPa
 *  14. Perform vertical mixing
 *  15. Surface, ocean and radiative exchange
 *  16. Run cloud/precipitation microphysics
 *  17. Apply latent-heating pressure feedback
 *  18. Evolve ground/snow/ocean state
 *
 *
 * HARD RULE:
 *
 * Temperature anomaly is NEVER used to generate weather.
 *
 * Actual temperature, moisture, wind, pressure, cloud condensate,
 * air-mass identity and terrain determine the weather.
 */

(function (global) {
    "use strict";


    const C =
        global.EuropaConfig;

    const U =
        global.EuropaUtils;

    const AtmosphereModule =
        global.EuropaAtmosphere;

    const MicrophysicsModule =
        global.EuropaMicrophysics;


    if (!C) {
        throw new Error(
            "EuropaCraft V10: config.js must load before europacraft-physics.js"
        );
    }


    if (!U) {
        throw new Error(
            "EuropaCraft V10: europacraft-utils.js must load before europacraft-physics.js"
        );
    }


    if (!AtmosphereModule) {
        throw new Error(
            "EuropaCraft V10: europacraft-atmosphere.js must load before europacraft-physics.js"
        );
    }


    if (!MicrophysicsModule) {
        throw new Error(
            "EuropaCraft V10: europacraft-microphysics.js must load before europacraft-physics.js"
        );
    }


    const TRACER_NAMES =
        AtmosphereModule.TRACER_NAMES;

    const TRACER_COUNT =
        TRACER_NAMES.length;

    const LEVEL_COUNT =
        AtmosphereModule.LEVEL_KEYS.length;


    /* ================================================================
       BASIC HELPERS
    ================================================================ */

    function finite(
        value,
        fallback = 0
    ) {

        const number =
            Number(value);

        return (
            Number.isFinite(number)
                ? number
                : fallback
        );
    }


    function capVector(
        u,
        v,
        maximum
    ) {

        const speed =
            Math.hypot(
                u,
                v
            );


        if (
            speed <= maximum ||
            speed <= 1e-12
        ) {

            return {
                u,
                v
            };
        }


        const factor =
            maximum /
            speed;


        return {

            u:
                u *
                factor,

            v:
                v *
                factor
        };
    }


    /* ================================================================
       PHYSICS
    ================================================================ */

    class Physics {

        constructor(
            terrain,
            ocean,
            atmosphere,
            synoptic,
            airMassManager = null,
            microphysics = null
        ) {

            if (!terrain) {
                throw new Error(
                    "EuropaCraft V10 Physics requires terrain."
                );
            }


            if (!ocean) {
                throw new Error(
                    "EuropaCraft V10 Physics requires ocean."
                );
            }


            if (!atmosphere) {
                throw new Error(
                    "EuropaCraft V10 Physics requires atmosphere."
                );
            }


            if (!synoptic) {
                throw new Error(
                    "EuropaCraft V10 Physics requires synoptic engine."
                );
            }


            this.t =
                terrain;

            this.o =
                ocean;

            this.a =
                atmosphere;

            this.s =
                synoptic;

            this.airMasses =
                airMassManager;


            this.microphysics =
                microphysics ||
                new MicrophysicsModule.Microphysics(
                    terrain,
                    ocean,
                    atmosphere
                );


            this.nx =
                terrain.nx;

            this.ny =
                terrain.ny;

            this.n =
                terrain.n;


            /* ========================================================
               SCRATCH ARRAYS
            ======================================================== */

            this.tmpPressure =
                new Float32Array(
                    this.n
                );


            this.tmpRH850 =
                new Float32Array(
                    this.n
                );


            this.tmpRH925 =
                new Float32Array(
                    this.n
                );


            this.tmpSurfaceClimatology =
                new Float32Array(
                    this.n
                );


            this.levelScratch =
                this.a.levels.map(
                    () => ({

                        tempC:
                            new Float32Array(
                                this.n
                            ),

                        q:
                            new Float32Array(
                                this.n
                            ),

                        u:
                            new Float32Array(
                                this.n
                            ),

                        v:
                            new Float32Array(
                                this.n
                            ),

                        cloudLiquid:
                            new Float32Array(
                                this.n
                            ),

                        cloudIce:
                            new Float32Array(
                                this.n
                            ),

                        tracers:
                            new Float32Array(
                                this.n *
                                TRACER_COUNT
                            )
                    })
                );


            this.diffusionScratch =
                new Float32Array(
                    this.n
                );


            this.tracerVectorA =
                new Float32Array(
                    TRACER_COUNT
                );


            this.tracerVectorB =
                new Float32Array(
                    TRACER_COUNT
                );


            this.boundaryTracer =
                new Float32Array(
                    TRACER_COUNT
                );


            this.stepCounter =
                0;
        }


        /* ============================================================
           GRID GEOMETRY
        ============================================================ */

        dxKmAt(
            cell
        ) {

            return (
                (
                    C.bounds.east -
                    C.bounds.west
                ) /
                (
                    this.nx -
                    1
                ) *
                U.kmPerDegreeLongitude(
                    this.t.lat[
                        cell
                    ]
                )
            );
        }


        dyKmAt(
            cell
        ) {

            return (
                (
                    C.bounds.north -
                    C.bounds.south
                ) /
                (
                    this.ny -
                    1
                ) *
                U.kmPerDegreeLatitude(
                    this.t.lat[
                        cell
                    ]
                )
            );
        }


        /* ============================================================
           SEMI-LAGRANGIAN BACKTRAJECTORY
        ============================================================ */

        backPosition(
            level,
            cell,
            dtSeconds
        ) {

            const latitude =
                this.t.lat[
                    cell
                ];


            const longitude =
                this.t.lon[
                    cell
                ];


            const u =
                level.u[
                    cell
                ];


            const v =
                level.v[
                    cell
                ];


            const eastKm =
                u *
                dtSeconds /
                1000;


            const northKm =
                v *
                dtSeconds /
                1000;


            const sourceLatitude =
                latitude -
                northKm /
                U.kmPerDegreeLatitude(
                    latitude
                );


            const sourceLongitude =
                longitude -
                eastKm /
                U.kmPerDegreeLongitude(
                    latitude
                );


            return this.t.xyFromLatLon(
                sourceLatitude,
                sourceLongitude
            );
        }


        /* ============================================================
           INTERLEAVED TRACER INTERPOLATION
        ============================================================ */

        sampleTracerBilinear(
            tracerArray,
            tracerIndex,
            x,
            y
        ) {

            x =
                U.clamp(
                    x,
                    0,
                    this.nx -
                    1.000001
                );


            y =
                U.clamp(
                    y,
                    0,
                    this.ny -
                    1.000001
                );


            const x0 =
                Math.floor(
                    x
                );

            const y0 =
                Math.floor(
                    y
                );


            const x1 =
                Math.min(
                    this.nx - 1,
                    x0 + 1
                );


            const y1 =
                Math.min(
                    this.ny - 1,
                    y0 + 1
                );


            const tx =
                x -
                x0;

            const ty =
                y -
                y0;


            const i00 =
                (
                    y0 *
                    this.nx +
                    x0
                ) *
                TRACER_COUNT +
                tracerIndex;


            const i10 =
                (
                    y0 *
                    this.nx +
                    x1
                ) *
                TRACER_COUNT +
                tracerIndex;


            const i01 =
                (
                    y1 *
                    this.nx +
                    x0
                ) *
                TRACER_COUNT +
                tracerIndex;


            const i11 =
                (
                    y1 *
                    this.nx +
                    x1
                ) *
                TRACER_COUNT +
                tracerIndex;


            const north =
                U.lerp(
                    tracerArray[
                        i00
                    ],
                    tracerArray[
                        i10
                    ],
                    tx
                );


            const south =
                U.lerp(
                    tracerArray[
                        i01
                    ],
                    tracerArray[
                        i11
                    ],
                    tx
                );


            return U.lerp(
                north,
                south,
                ty
            );
        }


        /* ============================================================
           ADVECTION
        ============================================================ */

        advectLevel(
            level,
            scratch,
            dtSeconds
        ) {

            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                const source =
                    this.backPosition(
                        level,
                        cell,
                        dtSeconds
                    );


                scratch.tempC[
                    cell
                ] =
                    U.bilinear(
                        level.tempC,
                        this.nx,
                        this.ny,
                        source.x,
                        source.y
                    );


                scratch.q[
                    cell
                ] =
                    U.bilinear(
                        level.q,
                        this.nx,
                        this.ny,
                        source.x,
                        source.y
                    );


                scratch.u[
                    cell
                ] =
                    U.bilinear(
                        level.u,
                        this.nx,
                        this.ny,
                        source.x,
                        source.y
                    );


                scratch.v[
                    cell
                ] =
                    U.bilinear(
                        level.v,
                        this.nx,
                        this.ny,
                        source.x,
                        source.y
                    );


                scratch.cloudLiquid[
                    cell
                ] =
                    Math.max(
                        0,
                        U.bilinear(
                            level.cloudLiquid,
                            this.nx,
                            this.ny,
                            source.x,
                            source.y
                        )
                    );


                scratch.cloudIce[
                    cell
                ] =
                    Math.max(
                        0,
                        U.bilinear(
                            level.cloudIce,
                            this.nx,
                            this.ny,
                            source.x,
                            source.y
                        )
                    );


                const tracerStart =
                    cell *
                    TRACER_COUNT;


                let tracerTotal =
                    0;


                for (
                    let tracer = 0;
                    tracer < TRACER_COUNT;
                    tracer++
                ) {

                    const value =
                        Math.max(
                            0,
                            this.sampleTracerBilinear(
                                level.tracers,
                                tracer,
                                source.x,
                                source.y
                            )
                        );


                    scratch.tracers[
                        tracerStart +
                        tracer
                    ] =
                        value;


                    tracerTotal +=
                        value;
                }


                if (
                    tracerTotal <=
                    1e-12
                ) {

                    scratch.tracers[
                        tracerStart
                    ] =
                        1;


                    for (
                        let tracer = 1;
                        tracer < TRACER_COUNT;
                        tracer++
                    ) {

                        scratch.tracers[
                            tracerStart +
                            tracer
                        ] =
                            0;
                    }
                }
                else {

                    const inverse =
                        1 /
                        tracerTotal;


                    for (
                        let tracer = 0;
                        tracer < TRACER_COUNT;
                        tracer++
                    ) {

                        scratch.tracers[
                            tracerStart +
                            tracer
                        ] *=
                            inverse;
                    }
                }
            }


            level.tempC.set(
                scratch.tempC
            );


            level.q.set(
                scratch.q
            );


            level.u.set(
                scratch.u
            );


            level.v.set(
                scratch.v
            );


            level.cloudLiquid.set(
                scratch.cloudLiquid
            );


            level.cloudIce.set(
                scratch.cloudIce
            );


            level.tracers.set(
                scratch.tracers
            );


            level.normalizeAllTracers();
        }


        advectPressure(
            dtSeconds
        ) {

            const surface =
                this.a.surface;


            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                const source =
                    this.backPosition(
                        surface,
                        cell,
                        dtSeconds
                    );


                this.tmpPressure[
                    cell
                ] =
                    U.bilinear(
                        this.a.pressureHpa,
                        this.nx,
                        this.ny,
                        source.x,
                        source.y
                    );
            }


            this.a.pressureHpa.set(
                this.tmpPressure
            );
        }


        advectAll(
            dtSeconds
        ) {

            this.advectPressure(
                dtSeconds
            );


            for (
                let levelIndex = 0;
                levelIndex < LEVEL_COUNT;
                levelIndex++
            ) {

                this.advectLevel(
                    this.a.levels[
                        levelIndex
                    ],
                    this.levelScratch[
                        levelIndex
                    ],
                    dtSeconds
                );
            }
        }


        /* ============================================================
           WEAK NUMERICAL DIFFUSION
        ============================================================ */

        diffuseScalar(
            array,
            amount
        ) {

            const fraction =
                U.clamp(
                    amount,
                    0,
                    0.15
                );


            if (
                fraction <=
                0
            ) {
                return;
            }


            this.diffusionScratch.set(
                array
            );


            const source =
                this.diffusionScratch;


            for (
                let y = 1;
                y < this.ny - 1;
                y++
            ) {

                for (
                    let x = 1;
                    x < this.nx - 1;
                    x++
                ) {

                    const cell =
                        y *
                        this.nx +
                        x;


                    const neighbourMean =
                        (
                            source[
                                cell - 1
                            ] +
                            source[
                                cell + 1
                            ] +
                            source[
                                cell - this.nx
                            ] +
                            source[
                                cell + this.nx
                            ]
                        ) *
                        0.25;


                    array[
                        cell
                    ] =
                        U.lerp(
                            source[
                                cell
                            ],
                            neighbourMean,
                            fraction
                        );
                }
            }
        }


        diffuseTracers(
            level,
            amount
        ) {

            const fraction =
                U.clamp(
                    amount,
                    0,
                    0.08
                );


            if (
                fraction <=
                0
            ) {
                return;
            }


            const scratch =
                this.levelScratch[
                    this.a.levels.indexOf(
                        level
                    )
                ].tracers;


            scratch.set(
                level.tracers
            );


            for (
                let y = 1;
                y < this.ny - 1;
                y++
            ) {

                for (
                    let x = 1;
                    x < this.nx - 1;
                    x++
                ) {

                    const cell =
                        y *
                        this.nx +
                        x;


                    const center =
                        cell *
                        TRACER_COUNT;


                    for (
                        let tracer = 0;
                        tracer < TRACER_COUNT;
                        tracer++
                    ) {

                        const neighbourMean =
                            (
                                scratch[
                                    (
                                        cell - 1
                                    ) *
                                    TRACER_COUNT +
                                    tracer
                                ] +
                                scratch[
                                    (
                                        cell + 1
                                    ) *
                                    TRACER_COUNT +
                                    tracer
                                ] +
                                scratch[
                                    (
                                        cell - this.nx
                                    ) *
                                    TRACER_COUNT +
                                    tracer
                                ] +
                                scratch[
                                    (
                                        cell + this.nx
                                    ) *
                                    TRACER_COUNT +
                                    tracer
                                ]
                            ) *
                            0.25;


                        level.tracers[
                            center +
                            tracer
                        ] =
                            U.lerp(
                                scratch[
                                    center +
                                    tracer
                                ],
                                neighbourMean,
                                fraction
                            );
                    }


                    level.normalizeTracersAt(
                        cell
                    );
                }
            }
        }


        diffuseAll(
            dtHours
        ) {

            for (
                const level of this.a.levels
            ) {

                this.diffuseScalar(
                    level.tempC,
                    C.advection.temperatureDiffusionPerHour *
                    dtHours
                );


                this.diffuseScalar(
                    level.q,
                    C.advection.moistureDiffusionPerHour *
                    dtHours
                );


                this.diffuseScalar(
                    level.u,
                    C.advection.momentumDiffusionPerHour *
                    dtHours
                );


                this.diffuseScalar(
                    level.v,
                    C.advection.momentumDiffusionPerHour *
                    dtHours
                );


                this.diffuseScalar(
                    level.cloudLiquid,
                    C.advection.cloudDiffusionPerHour *
                    dtHours
                );


                this.diffuseScalar(
                    level.cloudIce,
                    C.advection.cloudDiffusionPerHour *
                    dtHours
                );


                this.diffuseTracers(
                    level,
                    C.advection.tracerDiffusionPerHour *
                    dtHours
                );
            }
        }


        /* ============================================================
           OPEN / CLIMATOLOGICAL BOUNDARIES
        ============================================================ */

        boundaryStrength(
            x,
            y
        ) {

            const edgeDistance =
                Math.min(
                    x,
                    y,
                    this.nx - 1 - x,
                    this.ny - 1 - y
                );


            if (
                edgeDistance >=
                3
            ) {
                return 0;
            }


            return (
                1 -
                edgeDistance /
                3
            );
        }


        applyBoundaryRelaxation(
            date,
            dtHours
        ) {

            const climate =
                global.EuropaClimate;


            if (!climate) {
                return;
            }


            const baseRate =
                C.advection.boundaryRelaxationPerHour *
                dtHours;


            if (
                baseRate <=
                0
            ) {
                return;
            }


            for (
                let y = 0;
                y < this.ny;
                y++
            ) {

                for (
                    let x = 0;
                    x < this.nx;
                    x++
                ) {

                    const edge =
                        this.boundaryStrength(
                            x,
                            y
                        );


                    if (
                        edge <=
                        0
                    ) {
                        continue;
                    }


                    const cell =
                        y *
                        this.nx +
                        x;


                    const blend =
                        U.clamp01(
                            baseRate *
                            edge
                        );


                    const latitude =
                        this.t.lat[
                            cell
                        ];


                    const longitude =
                        this.t.lon[
                            cell
                        ];


                    const landFraction =
                        this.t.land[
                            cell
                        ];


                    const altitude =
                        this.t.altitudeM[
                            cell
                        ];


                    const climateResult =
                        climate.getClimate(
                            latitude,
                            longitude,
                            {
                                landFraction,

                                altitudeM:
                                    altitude
                            }
                        );


                    const baseline =
                        this.a.climatologyAtIndex(
                            cell,
                            date
                        );


                    this.tmpSurfaceClimatology[
                        cell
                    ] =
                        baseline;


                    for (
                        let tracer = 0;
                        tracer < TRACER_COUNT;
                        tracer++
                    ) {

                        this.boundaryTracer[
                            tracer
                        ] =
                            Math.max(
                                0,
                                (
                                    climateResult.normalized[
                                        TRACER_NAMES[
                                            tracer
                                        ]
                                    ] ||
                                    0
                                ) /
                                100
                            );
                    }


                    U.normalizeWeights(
                        this.boundaryTracer
                    );


                    for (
                        let levelIndex = 0;
                        levelIndex < LEVEL_COUNT;
                        levelIndex++
                    ) {

                        const level =
                            this.a.levels[
                                levelIndex
                            ];


                        const height =
                            level.approximateHeightM;


                        const targetTemperature =
                            baseline +
                            C.vertical.environmentalLapseRateCPerKm *
                            altitude /
                            1000 -
                            C.vertical.environmentalLapseRateCPerKm *
                            height /
                            1000;


                        const pressure =
                            this.a.pressureAt(
                                levelIndex,
                                cell
                            );


                        const targetRH =
                            U.clamp(
                                0.72 -
                                levelIndex *
                                0.06 +
                                (
                                    1 -
                                    landFraction
                                ) *
                                0.08,
                                0.40,
                                0.88
                            );


                        const targetQ =
                            U.qsatFromTempPressure(
                                targetTemperature,
                                pressure
                            ) *
                            targetRH;


                        level.tempC[
                            cell
                        ] =
                            U.lerp(
                                level.tempC[
                                    cell
                                ],
                                targetTemperature,
                                blend
                            );


                        level.q[
                            cell
                        ] =
                            U.lerp(
                                level.q[
                                    cell
                                ],
                                targetQ,
                                blend
                            );


                        const tracerStart =
                            cell *
                            TRACER_COUNT;


                        for (
                            let tracer = 0;
                            tracer < TRACER_COUNT;
                            tracer++
                        ) {

                            level.tracers[
                                tracerStart +
                                tracer
                            ] =
                                U.lerp(
                                    level.tracers[
                                        tracerStart +
                                        tracer
                                    ],
                                    this.boundaryTracer[
                                        tracer
                                    ],
                                    blend
                                );
                        }


                        level.normalizeTracersAt(
                            cell
                        );
                    }
                }
            }
        }


        /* ============================================================
           SYNOPTIC PRESSURE EVOLUTION
        ============================================================ */

        evolvePressureTowardSynoptic(
            dtHours
        ) {

            let domainMeanTemperature =
                0;


            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                domainMeanTemperature +=
                    this.a.surface.tempC[
                        cell
                    ];
            }


            domainMeanTemperature /=
                this.n;


            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                const latitude =
                    this.t.lat[
                        cell
                    ];


                const longitude =
                    this.t.lon[
                        cell
                    ];


                const currentPressure =
                    this.a.pressureHpa[
                        cell
                    ];


                const signal =
                    this.s.pressureSignalAt(
                        latitude,
                        longitude,
                        1015
                    );


                /*
                 * Broad synoptic forcing.
                 */

                const synopticChange =
                    (
                        signal.targetPressureHpa -
                        currentPressure
                    ) *
                    C.dynamics.pressureRelaxationPerHour;


                /*
                 * Cold dense columns favour surface pressure rises,
                 * warm columns favour falls.
                 */

                const thermalDifference =
                    domainMeanTemperature -
                    this.a.surface.tempC[
                        cell
                    ];


                const thermalChange =
                    thermalDifference *
                    C.dynamics.thermalPressureResponse *
                    0.10;


                let tendency =
                    synopticChange +
                    thermalChange;


                tendency =
                    U.clamp(
                        tendency,
                        -C.dynamics.maxPressureChangeHpaPerHour,
                        C.dynamics.maxPressureChangeHpaPerHour
                    );


                this.a.pressureTendencyHpaHr[
                    cell
                ] =
                    tendency;


                this.a.pressureHpa[
                    cell
                ] =
                    U.clamp(
                        currentPressure +
                        tendency *
                        dtHours,
                        C.limits.pressureMinHpa,
                        C.limits.pressureMaxHpa
                    );
            }
        }


        /* ============================================================
           WIND FROM PRESSURE
        ============================================================ */

        updateWind(
            dtHours
        ) {

            const a =
                this.a;


            for (
                let levelIndex = 0;
                levelIndex < LEVEL_COUNT;
                levelIndex++
            ) {

                const level =
                    a.levels[
                        levelIndex
                    ];


                const upperFactor =
                    [
                        0.72,
                        0.90,
                        1.08,
                        1.28
                    ][
                        levelIndex
                    ];


                for (
                    let y = 0;
                    y < this.ny;
                    y++
                ) {

                    for (
                        let x = 0;
                        x < this.nx;
                        x++
                    ) {

                        const cell =
                            y *
                            this.nx +
                            x;


                        const dx =
                            this.dxKmAt(
                                cell
                            );


                        const dy =
                            this.dyKmAt(
                                cell
                            );


                        const pressureGradient =
                            U.gradient2D(
                                a.pressureHpa,
                                this.nx,
                                this.ny,
                                x,
                                y,
                                dx,
                                dy
                            );


                        const latitude =
                            this.t.lat[
                                cell
                            ];


                        /*
                         * Simplified geostrophic response.
                         *
                         * Coriolis weakens toward the southern edge but is
                         * prevented from becoming numerically singular.
                         */

                        const coriolis =
                            Math.max(
                                0.42,
                                Math.abs(
                                    Math.sin(
                                        latitude *
                                        U.DEG
                                    )
                                )
                            ) *
                            C.dynamics.coriolisStrength;


                        const gradientScale =
                            1280 *
                            C.dynamics.pressureGradientAcceleration *
                            upperFactor;


                        let targetU =
                            -pressureGradient.dy *
                            gradientScale /
                            coriolis;


                        let targetV =
                            pressureGradient.dx *
                            gradientScale /
                            coriolis;


                        /*
                         * Thermal-wind contribution aloft.
                         *
                         * Strong horizontal temperature boundaries
                         * strengthen upper winds without directly altering
                         * surface temperature.
                         */

                        if (
                            levelIndex >= 2
                        ) {

                            const temperatureGradient =
                                U.gradient2D(
                                    level.tempC,
                                    this.nx,
                                    this.ny,
                                    x,
                                    y,
                                    dx,
                                    dy
                                );


                            const thermalScale =
                                levelIndex === 2
                                    ? 150
                                    : 250;


                            targetU +=
                                -temperatureGradient.dy *
                                thermalScale;


                            targetV +=
                                temperatureGradient.dx *
                                thermalScale;
                        }


                        /*
                         * User steering arrows add momentum only.
                         */

                        const steering =
                            this.s.momentumForcingAt(
                                latitude,
                                this.t.lon[
                                    cell
                                ],
                                levelIndex
                            );


                        targetU +=
                            steering.u;


                        targetV +=
                            steering.v;


                        /*
                         * Surface friction.
                         */

                        let drag;


                        if (
                            levelIndex === 0
                        ) {

                            drag =
                                this.t.land[
                                    cell
                                ] >
                                0.5
                                    ? C.dynamics.surfaceDragLand
                                    : C.dynamics.surfaceDragSea;
                        }
                        else {

                            drag =
                                C.dynamics.upperAirDrag *
                                (
                                    1 -
                                    levelIndex *
                                    0.12
                                );
                        }


                        const responseRate =
                            U.clamp(
                                (
                                    0.26 *
                                    upperFactor -
                                    drag *
                                    0.30
                                ) *
                                dtHours,
                                0,
                                1
                            );


                        let u =
                            U.lerp(
                                level.u[
                                    cell
                                ],
                                targetU,
                                responseRate
                            );


                        let v =
                            U.lerp(
                                level.v[
                                    cell
                                ],
                                targetV,
                                responseRate
                            );


                        /*
                         * Direct steering should be noticeable in testing.
                         */

                        if (
                            steering.weight >
                            0
                        ) {

                            const directBlend =
                                U.clamp01(
                                    steering.weight *
                                    0.12 *
                                    dtHours
                                );


                            u =
                                U.lerp(
                                    u,
                                    steering.u,
                                    directBlend
                                );


                            v =
                                U.lerp(
                                    v,
                                    steering.v,
                                    directBlend
                                );
                        }


                        const capped =
                            capVector(
                                u,
                                v,
                                C.limits.windMaxMs
                            );


                        level.u[
                            cell
                        ] =
                            capped.u;


                        level.v[
                            cell
                        ] =
                            capped.v;
                    }
                }
            }
        }


        /* ============================================================
           RH SCRATCH FIELDS
        ============================================================ */

        calculateLowLevelHumidityFields() {

            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                this.tmpRH925[
                    cell
                ] =
                    U.relativeHumidity(
                        this.a.level925.tempC[
                            cell
                        ],
                        925,
                        this.a.level925.q[
                            cell
                        ]
                    );


                this.tmpRH850[
                    cell
                ] =
                    U.relativeHumidity(
                        this.a.level850.tempC[
                            cell
                        ],
                        850,
                        this.a.level850.q[
                            cell
                        ]
                    );
            }
        }


        /* ============================================================
           TRACER CONTRAST
        ============================================================ */

        tracerDifferenceBetween(
            level,
            cellA,
            cellB
        ) {

            const startA =
                cellA *
                TRACER_COUNT;


            const startB =
                cellB *
                TRACER_COUNT;


            let difference =
                0;


            for (
                let tracer = 0;
                tracer < TRACER_COUNT;
                tracer++
            ) {

                difference +=
                    Math.abs(
                        level.tracers[
                            startA +
                            tracer
                        ] -
                        level.tracers[
                            startB +
                            tracer
                        ]
                    );
            }


            return U.clamp01(
                difference *
                0.5
            );
        }


        maximumNeighbourTracerContrast(
            level,
            x,
            y
        ) {

            const cell =
                y *
                this.nx +
                x;


            let maximum =
                0;


            if (
                x > 0
            ) {

                maximum =
                    Math.max(
                        maximum,
                        this.tracerDifferenceBetween(
                            level,
                            cell,
                            cell - 1
                        )
                    );
            }


            if (
                x <
                this.nx - 1
            ) {

                maximum =
                    Math.max(
                        maximum,
                        this.tracerDifferenceBetween(
                            level,
                            cell,
                            cell + 1
                        )
                    );
            }


            if (
                y > 0
            ) {

                maximum =
                    Math.max(
                        maximum,
                        this.tracerDifferenceBetween(
                            level,
                            cell,
                            cell - this.nx
                        )
                    );
            }


            if (
                y <
                this.ny - 1
            ) {

                maximum =
                    Math.max(
                        maximum,
                        this.tracerDifferenceBetween(
                            level,
                            cell,
                            cell + this.nx
                        )
                    );
            }


            return maximum;
        }


        /* ============================================================
           FRONTS, CONVERGENCE AND VORTICITY
        ============================================================ */

        diagnoseDynamics(
            dtHours
        ) {

            const a =
                this.a;


            this.calculateLowLevelHumidityFields();


            for (
                let y = 0;
                y < this.ny;
                y++
            ) {

                for (
                    let x = 0;
                    x < this.nx;
                    x++
                ) {

                    const cell =
                        y *
                        this.nx +
                        x;


                    const dx =
                        this.dxKmAt(
                            cell
                        );


                    const dy =
                        this.dyKmAt(
                            cell
                        );


                    /*
                     * 925 hPa is used for lower-tropospheric convergence.
                     */

                    const convergence =
                        U.convergence2D(
                            a.level925.u,
                            a.level925.v,
                            this.nx,
                            this.ny,
                            x,
                            y,
                            dx,
                            dy
                        );


                    const divergence =
                        -convergence;


                    const vorticity =
                        U.vorticity2D(
                            a.level925.u,
                            a.level925.v,
                            this.nx,
                            this.ny,
                            x,
                            y,
                            dx,
                            dy
                        );


                    a.convergence[
                        cell
                    ] =
                        convergence;


                    a.divergence[
                        cell
                    ] =
                        divergence;


                    a.vorticity[
                        cell
                    ] =
                        vorticity;


                    /*
                     * 850 hPa is the principal V10 air-mass/front level.
                     */

                    const temperatureGradient =
                        U.gradient2D(
                            a.level850.tempC,
                            this.nx,
                            this.ny,
                            x,
                            y,
                            dx,
                            dy
                        );


                    const humidityGradient =
                        U.gradient2D(
                            this.tmpRH850,
                            this.nx,
                            this.ny,
                            x,
                            y,
                            dx,
                            dy
                        );


                    const tempGradientPer100Km =
                        Math.hypot(
                            temperatureGradient.dx,
                            temperatureGradient.dy
                        ) *
                        100;


                    const humidityGradientPer100Km =
                        Math.hypot(
                            humidityGradient.dx,
                            humidityGradient.dy
                        ) *
                        100;


                    const tracerContrast =
                        this.maximumNeighbourTracerContrast(
                            a.level850,
                            x,
                            y
                        );


                    a.temperatureGradient[
                        cell
                    ] =
                        tempGradientPer100Km;


                    a.humidityGradient[
                        cell
                    ] =
                        humidityGradientPer100Km;


                    a.tracerContrast[
                        cell
                    ] =
                        tracerContrast;


                    const temperatureScore =
                        U.smoothstep(
                            C.fronts.temperatureGradientThresholdCPer100Km,
                            C.fronts.temperatureGradientThresholdCPer100Km *
                                3.2,
                            tempGradientPer100Km
                        );


                    const humidityScore =
                        U.smoothstep(
                            C.fronts.humidityGradientThresholdPer100Km,
                            C.fronts.humidityGradientThresholdPer100Km *
                                4,
                            humidityGradientPer100Km
                        );


                    const tracerScore =
                        U.smoothstep(
                            C.fronts.tracerContrastThreshold,
                            0.75,
                            tracerContrast
                        );


                    const convergenceScore =
                        U.smoothstep(
                            C.fronts.convergenceThreshold,
                            C.fronts.convergenceThreshold *
                                5,
                            Math.max(
                                0,
                                convergence
                            )
                        );


                    /*
                     * A real front requires more than one signal.
                     *
                     * Strong temperature contrast alone is not enough.
                     * Strong tracer contrast alone is not enough.
                     */

                    let instantaneousFront =
                        (
                            temperatureScore *
                                C.fronts.temperatureGradientWeight +
                            humidityScore *
                                C.fronts.humidityGradientWeight +
                            tracerScore *
                                C.fronts.tracerContrastWeight +
                            convergenceScore *
                                C.fronts.convergenceWeight
                        ) /
                        (
                            C.fronts.temperatureGradientWeight +
                            C.fronts.humidityGradientWeight +
                            C.fronts.tracerContrastWeight +
                            C.fronts.convergenceWeight
                        );


                    const structuralSupport =
                        Math.max(
                            temperatureScore,
                            tracerScore
                        );


                    instantaneousFront *=
                        (
                            0.35 +
                            0.65 *
                            structuralSupport
                        );


                    instantaneousFront =
                        U.clamp01(
                            instantaneousFront
                        );


                    /*
                     * Front strength is persistent.
                     *
                     * This prevents fronts from flashing on/off from tiny
                     * four-minute numerical variations.
                     */

                    let front =
                        a.frontStrength[
                            cell
                        ];


                    front +=
                        instantaneousFront *
                        C.fronts.frontogenesisPerHour *
                        dtHours *
                        C.fronts.maximumFrontStrength;


                    front -=
                        C.fronts.decayPerHour *
                        dtHours *
                        (
                            0.35 +
                            0.65 *
                            (
                                1 -
                                instantaneousFront
                            )
                        );


                    front =
                        U.clamp(
                            front,
                            0,
                            C.fronts.maximumFrontStrength
                        );


                    a.frontStrength[
                        cell
                    ] =
                        front;


                    /*
                     * Temperature advection distinguishes broadly cold
                     * and warm frontal forcing.
                     */

                    const u =
                        a.level850.u[
                            cell
                        ];


                    const v =
                        a.level850.v[
                            cell
                        ];


                    const thermalAdvection =
                        -(
                            u *
                                temperatureGradient.dx +
                            v *
                                temperatureGradient.dy
                        );


                    const frontTypeMultiplier =
                        thermalAdvection <
                        -0.015
                            ? C.fronts.coldFrontLiftMultiplier
                            : thermalAdvection >
                              0.015
                                ? C.fronts.warmFrontLiftMultiplier
                                : 1;


                    const convergenceLift =
                        U.clamp(
                            Math.max(
                                0,
                                convergence
                            ) /
                            Math.max(
                                0.001,
                                C.fronts.convergenceThreshold
                            ),
                            0,
                            4
                        );


                    a.frontalLift[
                        cell
                    ] =
                        U.clamp(
                            front *
                            (
                                0.20 +
                                0.80 *
                                U.clamp01(
                                    convergenceLift /
                                    2
                                )
                            ) *
                            C.fronts.frontalLiftMultiplier *
                            frontTypeMultiplier *
                            0.22,
                            0,
                            3
                        );
                }
            }
        }


        /* ============================================================
           OROGRAPHIC LIFT
        ============================================================ */

        diagnoseOrographicLift() {

            const a =
                this.a;


            for (
                let y = 0;
                y < this.ny;
                y++
            ) {

                for (
                    let x = 0;
                    x < this.nx;
                    x++
                ) {

                    const cell =
                        y *
                        this.nx +
                        x;


                    if (
                        this.t.land[
                            cell
                        ] <
                        0.25
                    ) {

                        a.orographicLift[
                            cell
                        ] =
                            0;

                        continue;
                    }


                    const dx =
                        this.dxKmAt(
                            cell
                        );


                    const dy =
                        this.dyKmAt(
                            cell
                        );


                    const terrainGradient =
                        U.gradient2D(
                            this.t.altitudeM,
                            this.nx,
                            this.ny,
                            x,
                            y,
                            dx,
                            dy
                        );


                    /*
                     * Use a low-level wind blend.
                     */

                    const u =
                        a.surface.u[
                            cell
                        ] *
                        0.35 +
                        a.level925.u[
                            cell
                        ] *
                        0.65;


                    const v =
                        a.surface.v[
                            cell
                        ] *
                        0.35 +
                        a.level925.v[
                            cell
                        ] *
                        0.65;


                    /*
                     * terrainGradient is m/km.
                     *
                     * wind m/s × m/km ÷ 1000 gives approximate m/s of
                     * terrain-following vertical motion.
                     */

                    const upslopeMs =
                        (
                            u *
                                terrainGradient.dx +
                            v *
                                terrainGradient.dy
                        ) /
                        1000;


                    let lift =
                        Math.max(
                            0,
                            upslopeMs
                        ) *
                        C.terrain.upslopeLiftStrength *
                        3.2;


                    const lowerRH =
                        (
                            a.surface.relativeHumidity[
                                cell
                            ] *
                            0.35 +
                            a.level925.relativeHumidity[
                                cell
                            ] *
                            0.65
                        );


                    if (
                        lowerRH >
                        0.88
                    ) {

                        lift *=
                            U.lerp(
                                1,
                                C.terrain.saturatedUpslopeBoost,
                                U.smoothstep(
                                    0.88,
                                    1,
                                    lowerRH
                                )
                            );
                    }


                    a.orographicLift[
                        cell
                    ] =
                        U.clamp(
                            lift,
                            0,
                            2.5
                        );
                }
            }
        }


        /* ============================================================
           CONVECTION
        ============================================================ */

        diagnoseConvection() {

            const a =
                this.a;


            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                if (
                    !C.convection.enabled
                ) {

                    a.convectiveLift[
                        cell
                    ] =
                        0;

                    continue;
                }


                const terrainHeight =
                    Math.max(
                        0,
                        this.t.altitudeM[
                            cell
                        ]
                    );


                const depthKm =
                    Math.max(
                        0.15,
                        (
                            1500 -
                            Math.min(
                                1400,
                                terrainHeight
                            )
                        ) /
                        1000
                    );


                const surfaceRH =
                    U.clamp01(
                        a.surface.relativeHumidity[
                            cell
                        ]
                    );


                /*
                 * Moist parcels cool more slowly with ascent.
                 */

                const parcelLapseRate =
                    U.lerp(
                        C.vertical.dryAdiabaticLapseRateCPerKm,
                        C.vertical.moistAdiabaticLapseRateCPerKm,
                        U.smoothstep(
                            0.55,
                            0.90,
                            surfaceRH
                        )
                    );


                const parcel850 =
                    a.surface.tempC[
                        cell
                    ] -
                    parcelLapseRate *
                    depthKm;


                let instability =
                    parcel850 -
                    a.level850.tempC[
                        cell
                    ];


                /*
                 * Cold air crossing warmer water receives additional
                 * maritime instability.
                 */

                if (
                    this.t.land[
                        cell
                    ] <
                        0.5 &&
                    this.o.sst
                ) {

                    const marineDifference =
                        this.o.sst[
                            cell
                        ] -
                        a.surface.tempC[
                            cell
                        ];


                    if (
                        marineDifference >
                        1.5
                    ) {

                        instability +=
                            (
                                marineDifference -
                                1.5
                            ) *
                            C.ocean.coldAirInstabilityBoost *
                            0.22;
                    }
                }


                const instabilityScore =
                    U.smoothstep(
                        C.convection.minimumInstabilityC,
                        C.convection.strongInstabilityC,
                        instability
                    );


                const moistureScore =
                    U.smoothstep(
                        C.convection.minimumRH,
                        0.94,
                        surfaceRH
                    );


                const externalTrigger =
                    U.clamp01(
                        (
                            a.frontalLift[
                                cell
                            ] +
                            a.orographicLift[
                                cell
                            ]
                        ) /
                        1.3
                    );


                let convective =
                    instabilityScore *
                    moistureScore *
                    (
                        0.45 +
                        0.55 *
                        Math.max(
                            externalTrigger,
                            C.convection.minimumTriggerLift
                        )
                    );


                convective *=
                    C.convection.maximumLiftBoost;


                a.convectiveLift[
                    cell
                ] =
                    U.clamp(
                        convective,
                        0,
                        2.5
                    );
            }
        }


        /* ============================================================
           TOTAL LIFT AND VERTICAL VELOCITY
        ============================================================ */

        calculateVerticalMotion(
            dtHours
        ) {

            const a =
                this.a;


            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                const convergenceContribution =
                    U.clamp(
                        Math.max(
                            0,
                            a.convergence[
                                cell
                            ]
                        ) /
                        Math.max(
                            0.001,
                            C.fronts.convergenceThreshold
                        ),
                        0,
                        4
                    ) *
                    C.verticalMotion.convergenceMultiplier *
                    0.12;


                const frontal =
                    a.frontalLift[
                        cell
                    ] *
                    C.verticalMotion.frontalMultiplier *
                    0.35;


                const orographic =
                    a.orographicLift[
                        cell
                    ] *
                    C.verticalMotion.orographicMultiplier *
                    0.42;


                const convective =
                    a.convectiveLift[
                        cell
                    ] *
                    C.verticalMotion.convectiveMultiplier *
                    0.45;


                const pressureFall =
                    Math.max(
                        0,
                        -a.pressureTendencyHpaHr[
                            cell
                        ]
                    ) *
                    C.verticalMotion.pressureTendencyMultiplier *
                    0.18;


                let totalLift =
                    convergenceContribution +
                    frontal +
                    orographic +
                    convective +
                    pressureFall;


                totalLift =
                    U.clamp(
                        totalLift,
                        0,
                        3.5
                    );


                a.totalLift[
                    cell
                ] =
                    totalLift;


                /*
                 * Vertical velocity profile.
                 *
                 * Typical stratiform ascent remains small.
                 * Convective cells can produce much larger values.
                 */

                const convectiveExtra =
                    a.convectiveLift[
                        cell
                    ] *
                    0.22;


                const targetW =
                    [
                        totalLift *
                            0.030,

                        totalLift *
                            0.075 +
                            convectiveExtra *
                            0.35,

                        totalLift *
                            0.095 +
                            convectiveExtra,

                        totalLift *
                            0.060 +
                            convectiveExtra *
                            0.75
                    ];


                for (
                    let levelIndex = 0;
                    levelIndex < LEVEL_COUNT;
                    levelIndex++
                ) {

                    const level =
                        a.levels[
                            levelIndex
                        ];


                    const relaxation =
                        U.clamp01(
                            (
                                0.55 +
                                totalLift *
                                0.18
                            ) *
                            dtHours
                        );


                    level.w[
                        cell
                    ] =
                        U.lerp(
                            level.w[
                                cell
                            ],
                            U.clamp(
                                targetW[
                                    levelIndex
                                ],
                                -C.limits.verticalVelocityMaxMs,
                                C.limits.verticalVelocityMaxMs
                            ),
                            relaxation
                        );


                    /*
                     * Subsidence where divergence dominates and there is
                     * little positive lift.
                     */

                    if (
                        totalLift <
                            0.08 &&
                        a.divergence[
                            cell
                        ] >
                            C.fronts.convergenceThreshold
                    ) {

                        const subsidence =
                            -U.clamp(
                                a.divergence[
                                    cell
                                ] /
                                C.fronts.convergenceThreshold *
                                0.015,
                                0,
                                0.12
                            );


                        level.w[
                            cell
                        ] =
                            U.lerp(
                                level.w[
                                    cell
                                ],
                                subsidence,
                                U.clamp01(
                                    0.30 *
                                    dtHours
                                )
                            );
                    }


                    level.w[
                        cell
                    ] *=
                        Math.max(
                            0,
                            1 -
                            C.verticalMotion.dampingPerHour *
                            dtHours
                        );
                }
            }
        }


        /* ============================================================
           PRESSURE RESPONSE TO DYNAMICS
        ============================================================ */

        applyDynamicPressureFeedback(
            dtHours
        ) {

            const a =
                this.a;


            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                const convergenceNormalized =
                    U.clamp(
                        a.convergence[
                            cell
                        ] /
                        Math.max(
                            0.001,
                            C.fronts.convergenceThreshold
                        ),
                        -4,
                        4
                    );


                const ascentNormalized =
                    U.clamp(
                        a.totalLift[
                            cell
                        ] /
                        2,
                        0,
                        2
                    );


                const divergenceNormalized =
                    U.clamp(
                        a.divergence[
                            cell
                        ] /
                        Math.max(
                            0.001,
                            C.fronts.convergenceThreshold
                        ),
                        0,
                        4
                    );


                let changePerHour =
                    -Math.max(
                        0,
                        convergenceNormalized
                    ) *
                        C.dynamics.convergencePressureResponse *
                        0.20 -
                    ascentNormalized *
                        C.dynamics.ascentPressureResponse *
                        0.22 +
                    divergenceNormalized *
                        C.dynamics.divergencePressureResponse *
                        0.16;


                changePerHour =
                    U.clamp(
                        changePerHour,
                        -C.dynamics.maxPressureChangeHpaPerHour,
                        C.dynamics.maxPressureChangeHpaPerHour
                    );


                a.pressureHpa[
                    cell
                ] =
                    U.clamp(
                        a.pressureHpa[
                            cell
                        ] +
                        changePerHour *
                        dtHours,
                        C.limits.pressureMinHpa,
                        C.limits.pressureMaxHpa
                    );


                a.pressureTendencyHpaHr[
                    cell
                ] +=
                    changePerHour;
            }
        }


        /* ============================================================
           VERTICAL MIXING
        ============================================================ */

        mixPair(
            lower,
            upper,
            cell,
            fraction
        ) {

            const mix =
                U.clamp(
                    fraction,
                    0,
                    0.18
                );


            if (
                mix <=
                0
            ) {
                return;
            }


            const tempMean =
                (
                    lower.tempC[
                        cell
                    ] +
                    upper.tempC[
                        cell
                    ]
                ) *
                0.5;


            const qMean =
                (
                    lower.q[
                        cell
                    ] +
                    upper.q[
                        cell
                    ]
                ) *
                0.5;


            const uMean =
                (
                    lower.u[
                        cell
                    ] +
                    upper.u[
                        cell
                    ]
                ) *
                0.5;


            const vMean =
                (
                    lower.v[
                        cell
                    ] +
                    upper.v[
                        cell
                    ]
                ) *
                0.5;


            const liquidMean =
                (
                    lower.cloudLiquid[
                        cell
                    ] +
                    upper.cloudLiquid[
                        cell
                    ]
                ) *
                0.5;


            const iceMean =
                (
                    lower.cloudIce[
                        cell
                    ] +
                    upper.cloudIce[
                        cell
                    ]
                ) *
                0.5;


            lower.tempC[
                cell
            ] =
                U.lerp(
                    lower.tempC[
                        cell
                    ],
                    tempMean,
                    mix
                );


            upper.tempC[
                cell
            ] =
                U.lerp(
                    upper.tempC[
                        cell
                    ],
                    tempMean,
                    mix
                );


            lower.q[
                cell
            ] =
                U.lerp(
                    lower.q[
                        cell
                    ],
                    qMean,
                    mix
                );


            upper.q[
                cell
            ] =
                U.lerp(
                    upper.q[
                        cell
                    ],
                    qMean,
                    mix
                );


            lower.u[
                cell
            ] =
                U.lerp(
                    lower.u[
                        cell
                    ],
                    uMean,
                    mix *
                    0.60
                );


            upper.u[
                cell
            ] =
                U.lerp(
                    upper.u[
                        cell
                    ],
                    uMean,
                    mix *
                    0.60
                );


            lower.v[
                cell
            ] =
                U.lerp(
                    lower.v[
                        cell
                    ],
                    vMean,
                    mix *
                    0.60
                );


            upper.v[
                cell
            ] =
                U.lerp(
                    upper.v[
                        cell
                    ],
                    vMean,
                    mix *
                    0.60
                );


            lower.cloudLiquid[
                cell
            ] =
                U.lerp(
                    lower.cloudLiquid[
                        cell
                    ],
                    liquidMean,
                    mix *
                    0.55
                );


            upper.cloudLiquid[
                cell
            ] =
                U.lerp(
                    upper.cloudLiquid[
                        cell
                    ],
                    liquidMean,
                    mix *
                    0.55
                );


            lower.cloudIce[
                cell
            ] =
                U.lerp(
                    lower.cloudIce[
                        cell
                    ],
                    iceMean,
                    mix *
                    0.55
                );


            upper.cloudIce[
                cell
            ] =
                U.lerp(
                    upper.cloudIce[
                        cell
                    ],
                    iceMean,
                    mix *
                    0.55
                );


            const lowerStart =
                cell *
                TRACER_COUNT;


            for (
                let tracer = 0;
                tracer < TRACER_COUNT;
                tracer++
            ) {

                const meanTracer =
                    (
                        lower.tracers[
                            lowerStart +
                            tracer
                        ] +
                        upper.tracers[
                            lowerStart +
                            tracer
                        ]
                    ) *
                    0.5;


                lower.tracers[
                    lowerStart +
                    tracer
                ] =
                    U.lerp(
                        lower.tracers[
                            lowerStart +
                            tracer
                        ],
                        meanTracer,
                        mix *
                        0.55
                    );


                upper.tracers[
                    lowerStart +
                    tracer
                ] =
                    U.lerp(
                        upper.tracers[
                            lowerStart +
                            tracer
                        ],
                        meanTracer,
                        mix *
                        0.55
                    );
            }


            lower.normalizeTracersAt(
                cell
            );


            upper.normalizeTracersAt(
                cell
            );
        }


        verticalMixing(
            dtHours
        ) {

            const a =
                this.a;


            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                const background =
                    C.vertical.backgroundMixingPerHour *
                    dtHours;


                const frontal =
                    U.clamp01(
                        a.frontalLift[
                            cell
                        ] /
                        2
                    ) *
                    C.vertical.frontalMixingPerHour *
                    dtHours;


                const convection =
                    U.clamp01(
                        a.convectiveLift[
                            cell
                        ] /
                        2
                    ) *
                    C.vertical.convectiveMixingPerHour *
                    dtHours;


                /*
                 * Strong convection mixes the lower column especially
                 * effectively.
                 */

                this.mixPair(
                    a.surface,
                    a.level925,
                    cell,
                    background +
                    frontal *
                        0.60 +
                    convection
                );


                this.mixPair(
                    a.level925,
                    a.level850,
                    cell,
                    background +
                    frontal +
                    convection *
                        0.80
                );


                this.mixPair(
                    a.level850,
                    a.level700,
                    cell,
                    background +
                    frontal *
                        0.75 +
                    convection *
                        0.55
                );
            }
        }


        /* ============================================================
           SURFACE, RADIATION AND MOISTURE EXCHANGE
        ============================================================ */

        surfaceProcesses(
            date,
            dtHours
        ) {

            const a =
                this.a;


            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                const latitude =
                    this.t.lat[
                        cell
                    ];


                const longitude =
                    this.t.lon[
                        cell
                    ];


                const land =
                    this.t.land[
                        cell
                    ];


                const altitude =
                    this.t.altitudeM[
                        cell
                    ];


                let temperature =
                    a.surface.tempC[
                        cell
                    ];


                let q =
                    a.surface.q[
                        cell
                    ];


                const pressure =
                    a.pressureHpa[
                        cell
                    ];


                const windSpeed =
                    Math.hypot(
                        a.surface.u[
                            cell
                        ],
                        a.surface.v[
                            cell
                        ]
                    );


                const cloud =
                    U.clamp01(
                        (
                            a.surface.cloudFraction[
                                cell
                            ] *
                                0.45 +
                            a.level925.cloudFraction[
                                cell
                            ] *
                                0.35 +
                            a.level850.cloudFraction[
                                cell
                            ] *
                                0.20
                        )
                    );


                const sinSolar =
                    U.solarSinElevation(
                        latitude,
                        longitude,
                        date
                    );


                const solar =
                    Math.max(
                        0,
                        sinSolar
                    );


                /* ----------------------------------------------------
                   OCEAN
                ---------------------------------------------------- */

                if (
                    land <
                    0.5
                ) {

                    const sst =
                        this.o.sst[
                            cell
                        ];


                    const heatExchange =
                        (
                            sst -
                            temperature
                        ) *
                        C.ocean.airSeaHeatExchangePerHour *
                        (
                            1 +
                            C.ocean.windHeatExchangeBoost *
                            windSpeed
                        ) *
                        dtHours;


                    temperature +=
                        heatExchange;


                    const qsatSea =
                        U.qsatFromTempPressure(
                            sst,
                            pressure
                        );


                    if (
                        q <
                        qsatSea
                    ) {

                        const humidityDeficit =
                            U.clamp01(
                                (
                                    qsatSea -
                                    q
                                ) /
                                Math.max(
                                    0.0001,
                                    qsatSea
                                )
                            );


                        let evaporation =
                            (
                                qsatSea -
                                q
                            ) *
                            C.ocean.evaporationBasePerHour *
                            (
                                1 +
                                C.ocean.windEvaporationBoost *
                                windSpeed
                            ) *
                            (
                                1 +
                                C.ocean.humidityDeficitBoost *
                                humidityDeficit
                            ) *
                            dtHours;


                        /*
                         * Cold air over warm water receives extra moisture
                         * flux and instability.
                         */

                        if (
                            sst -
                            temperature >
                            2
                        ) {

                            evaporation *=
                                (
                                    1 +
                                    C.ocean.coldAirInstabilityBoost *
                                    U.clamp(
                                        (
                                            sst -
                                            temperature -
                                            2
                                        ) /
                                        10,
                                        0,
                                        1
                                    )
                                );
                        }


                        q +=
                            evaporation;
                    }


                    /*
                     * Sea has very small direct diurnal temperature swing.
                     */

                    temperature +=
                        solar *
                        C.radiation.oceanSolarHeating *
                        dtHours;
                }


                /* ----------------------------------------------------
                   LAND
                ---------------------------------------------------- */

                else {

                    const cloudSolar =
                        1 -
                        cloud *
                        C.radiation.cloudShortwaveSuppression;


                    const solarHeating =
                        solar *
                        cloudSolar *
                        C.radiation.landSolarHeating *
                        5.0;


                    const nightFactor =
                        solar <=
                        0.02
                            ? 1
                            : U.clamp01(
                                1 -
                                solar *
                                4
                            );


                    const cloudRetention =
                        (
                            a.surface.cloudFraction[
                                cell
                            ] *
                                C.radiation.lowCloudLongwaveRetention +
                            a.level850.cloudFraction[
                                cell
                            ] *
                                C.radiation.highCloudLongwaveRetention
                        );


                    const nightCooling =
                        C.radiation.clearNightCooling *
                        nightFactor *
                        (
                            1 -
                            U.clamp01(
                                cloudRetention
                            ) *
                            0.78
                        );


                    /*
                     * Ground responds much faster than atmospheric column.
                     */

                    let targetGround =
                        temperature +
                        solarHeating *
                            14 -
                        nightCooling *
                            20;


                    if (
                        a.snowDepthCm[
                            cell
                        ] >
                        0.2
                    ) {

                        targetGround -=
                            solar *
                            C.radiation.snowAlbedoCooling *
                            4;
                    }


                    const groundResponse =
                        U.clamp01(
                            (
                                1 -
                                C.ground.temperatureMemory
                            ) *
                            10 *
                            dtHours
                        );


                    a.groundC[
                        cell
                    ] =
                        U.lerp(
                            a.groundC[
                                cell
                            ],
                            targetGround,
                            groundResponse
                        );


                    temperature +=
                        (
                            a.groundC[
                                cell
                            ] -
                            temperature
                        ) *
                        C.ground.airGroundExchangePerHour *
                        (
                            1 +
                            windSpeed *
                            0.025
                        ) *
                        dtHours;


                    /*
                     * Soil evaporation.
                     */

                    const soilMoisture =
                        U.clamp01(
                            a.groundMoisture[
                                cell
                            ]
                        );


                    const qsatGround =
                        U.qsatFromTempPressure(
                            a.groundC[
                                cell
                            ],
                            pressure
                        );


                    if (
                        q <
                            qsatGround &&
                        soilMoisture >
                            0.02
                    ) {

                        const evaporation =
                            (
                                qsatGround -
                                q
                            ) *
                            soilMoisture *
                            0.018 *
                            (
                                1 +
                                windSpeed *
                                0.035
                            ) *
                            (
                                0.25 +
                                solar *
                                0.75
                            ) *
                            dtHours;


                        q +=
                            evaporation;


                        a.groundMoisture[
                            cell
                        ] =
                            Math.max(
                                0,
                                a.groundMoisture[
                                    cell
                                ] -
                                evaporation *
                                8
                            );
                    }


                    /*
                     * Terrain lapse-rate tendency applies to surface air
                     * gradually rather than repeatedly subtracting full
                     * altitude every timestep.
                     */

                    if (
                        altitude >
                        150
                    ) {

                        const referenceSurface =
                            a.climatologyAtIndex(
                                cell,
                                date
                            );


                        const altitudeTarget =
                            referenceSurface;


                        temperature =
                            U.lerp(
                                temperature,
                                altitudeTarget,
                                U.clamp01(
                                    0.004 *
                                    dtHours
                                )
                            );
                    }
                }


                /* ----------------------------------------------------
                   SNOW ALBEDO SURFACE COOLING
                ---------------------------------------------------- */

                if (
                    a.snowDepthCm[
                        cell
                    ] >
                        0.2 &&
                    solar >
                        0
                ) {

                    temperature -=
                        solar *
                        C.radiation.snowAlbedoCooling *
                        0.18 *
                        dtHours;
                }


                a.surface.tempC[
                    cell
                ] =
                    U.clamp(
                        temperature,
                        C.limits.temperatureMinC,
                        C.limits.temperatureMaxC
                    );


                a.surface.q[
                    cell
                ] =
                    U.clamp(
                        q,
                        0,
                        C.limits.specificHumidityMaxKgKg
                    );
            }


            a.updateAllThermodynamicDiagnostics();
        }


        /* ============================================================
           SNOW SETTLING AND MELTING
        ============================================================ */

        evolveSnowAndGround(
            date,
            dtHours
        ) {

            const a =
                this.a;


            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                if (
                    this.t.land[
                        cell
                    ] <
                        0.5
                ) {
                    continue;
                }


                let depth =
                    Math.max(
                        0,
                        a.snowDepthCm[
                            cell
                        ]
                    );


                let swe =
                    Math.max(
                        0,
                        a.snowWaterEquivalentMm[
                            cell
                        ]
                    );


                if (
                    depth <=
                        0 &&
                    swe <=
                        0
                ) {
                    continue;
                }


                /*
                 * Settling occurs even below freezing.
                 */

                depth *=
                    Math.max(
                        0,
                        1 -
                        C.snow.settlingPerHour *
                        dtHours
                    );


                const temperature =
                    a.surface.tempC[
                        cell
                    ];


                const solar =
                    Math.max(
                        0,
                        U.solarSinElevation(
                            this.t.lat[
                                cell
                            ],
                            this.t.lon[
                                cell
                            ],
                            date
                        )
                    );


                const rainRate =
                    a.rainMmHr[
                        cell
                    ];


                let meltMm =
                    0;


                if (
                    temperature >
                    0
                ) {

                    meltMm +=
                        temperature *
                        C.snow.airTemperatureMeltPerHour *
                        dtHours;
                }


                meltMm +=
                    rainRate *
                    C.snow.rainMeltPerMm *
                    dtHours;


                meltMm +=
                    solar *
                    C.snow.solarMeltPerHour *
                    dtHours;


                meltMm =
                    Math.min(
                        swe,
                        meltMm
                    );


                if (
                    meltMm >
                    0
                ) {

                    const fraction =
                        swe >
                        0
                            ? meltMm /
                              swe
                            : 1;


                    swe -=
                        meltMm;


                    depth *=
                        Math.max(
                            0,
                            1 -
                            fraction
                        );


                    a.groundMoisture[
                        cell
                    ] =
                        U.clamp01(
                            a.groundMoisture[
                                cell
                            ] +
                            meltMm *
                            0.025
                        );
                }


                if (
                    swe <=
                    0.001
                ) {

                    swe =
                        0;

                    depth =
                        0;
                }


                a.snowDepthCm[
                    cell
                ] =
                    Math.max(
                        0,
                        depth
                    );


                a.snowWaterEquivalentMm[
                    cell
                ] =
                    Math.max(
                        0,
                        swe
                    );
            }
        }


        /* ============================================================
           LATENT-HEATING PRESSURE RESPONSE
        ============================================================ */

        applyMicrophysicalPressureFeedback(
            dtHours
        ) {

            const a =
                this.a;


            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                /*
                 * condensationRate is kg/kg/hour.
                 */

                const condensation =
                    Math.max(
                        0,
                        a.condensationRate[
                            cell
                        ]
                    );


                if (
                    condensation <=
                    0
                ) {
                    continue;
                }


                const changePerHour =
                    -U.clamp(
                        condensation *
                        1000 *
                        C.dynamics.latentHeatingPressureResponse,
                        0,
                        0.80
                    );


                a.pressureHpa[
                    cell
                ] =
                    U.clamp(
                        a.pressureHpa[
                            cell
                        ] +
                        changePerHour *
                        dtHours,
                        C.limits.pressureMinHpa,
                        C.limits.pressureMaxHpa
                    );


                a.pressureTendencyHpaHr[
                    cell
                ] +=
                    changePerHour;
            }
        }


        /* ============================================================
           OCEAN
        ============================================================ */

        updateOcean(
            date,
            dtHours
        ) {

            if (
                !this.o ||
                typeof this.o.step !==
                    "function"
            ) {
                return;
            }


            this.o.step(
                date,
                this.a.surface.tempC,
                this.a.surface.u,
                this.a.surface.v,
                dtHours
            );
        }


        /* ============================================================
           SAFETY CLAMPS
        ============================================================ */

        enforceLimits() {

            const a =
                this.a;


            U.clampArray(
                a.pressureHpa,
                C.limits.pressureMinHpa,
                C.limits.pressureMaxHpa
            );


            for (
                const level of a.levels
            ) {

                U.clampArray(
                    level.tempC,
                    C.limits.temperatureMinC,
                    C.limits.temperatureMaxC
                );


                U.clampArray(
                    level.q,
                    0,
                    C.limits.specificHumidityMaxKgKg
                );


                U.clampArray(
                    level.cloudLiquid,
                    0,
                    C.limits.cloudWaterMaxKgKg
                );


                U.clampArray(
                    level.cloudIce,
                    0,
                    C.limits.cloudIceMaxKgKg
                );


                U.clampArray(
                    level.w,
                    -C.limits.verticalVelocityMaxMs,
                    C.limits.verticalVelocityMaxMs
                );


                for (
                    let cell = 0;
                    cell < this.n;
                    cell++
                ) {

                    const capped =
                        capVector(
                            level.u[
                                cell
                            ],
                            level.v[
                                cell
                            ],
                            C.limits.windMaxMs
                        );


                    level.u[
                        cell
                    ] =
                        capped.u;


                    level.v[
                        cell
                    ] =
                        capped.v;
                }
            }
        }


        /* ============================================================
           COMPLETE PHYSICS STEP
        ============================================================ */

        step(
            date,
            dtMinutes
        ) {

            const minutes =
                Math.max(
                    0,
                    finite(
                        dtMinutes,
                        0
                    )
                );


            if (
                minutes <=
                0
            ) {
                return;
            }


            /*
             * The world orchestrator should normally call exactly four
             * minutes at a time.
             *
             * A safety cap prevents accidental enormous timesteps.
             */

            if (
                minutes >
                C.time.physicsStepMinutes *
                    1.001
            ) {

                throw new Error(
                    "EuropaCraft V10 Physics received an oversized timestep (" +
                    minutes +
                    " minutes). Fast playback must execute repeated " +
                    C.time.physicsStepMinutes +
                    "-minute physics steps."
                );
            }


            const dtHours =
                minutes /
                60;


            const dtSeconds =
                minutes *
                60;


            this.stepCounter++;


            /* --------------------------------------------------------
               0. ADVANCE EXTERNAL SYNOPTIC/AIR-MASS RECORDS
            -------------------------------------------------------- */

            this.s.step(
                date,
                dtHours
            );


            if (
                this.airMasses &&
                typeof this.airMasses.step ===
                    "function"
            ) {

                this.airMasses.step(
                    date,
                    dtHours
                );
            }


            /* --------------------------------------------------------
               1. TRANSPORT
            -------------------------------------------------------- */

            this.advectAll(
                dtSeconds
            );


            /* --------------------------------------------------------
               2. SMALL NUMERICAL MIXING
            -------------------------------------------------------- */

            this.diffuseAll(
                dtHours
            );


            /* --------------------------------------------------------
               3. OPEN BOUNDARIES
            -------------------------------------------------------- */

            this.applyBoundaryRelaxation(
                date,
                dtHours
            );


            /* --------------------------------------------------------
               4. SYNOPTIC / THERMAL PRESSURE EVOLUTION
            -------------------------------------------------------- */

            this.evolvePressureTowardSynoptic(
                dtHours
            );


            /* --------------------------------------------------------
               5. PRESSURE-DRIVEN WIND
            -------------------------------------------------------- */

            this.updateWind(
                dtHours
            );


            /* --------------------------------------------------------
               6. UPDATE BASIC THERMODYNAMIC DIAGNOSTICS
            -------------------------------------------------------- */

            this.a.updateAllThermodynamicDiagnostics();


            /* --------------------------------------------------------
               7. CONVERGENCE AND FRONTOGENESIS
            -------------------------------------------------------- */

            this.diagnoseDynamics(
                dtHours
            );


            /* --------------------------------------------------------
               8. OROGRAPHIC ASCENT
            -------------------------------------------------------- */

            this.diagnoseOrographicLift();


            /* --------------------------------------------------------
               9. CONVECTIVE INSTABILITY
            -------------------------------------------------------- */

            this.diagnoseConvection();


            /* --------------------------------------------------------
              10. VERTICAL MOTION
            -------------------------------------------------------- */

            this.calculateVerticalMotion(
                dtHours
            );


            /* --------------------------------------------------------
              11. PRESSURE RESPONSE TO CONVERGENCE / ASCENT
            -------------------------------------------------------- */

            this.applyDynamicPressureFeedback(
                dtHours
            );


            /* --------------------------------------------------------
              12. VERTICAL MIXING
            -------------------------------------------------------- */

            this.verticalMixing(
                dtHours
            );


            /* --------------------------------------------------------
              13. SURFACE / RADIATIVE / MOISTURE EXCHANGE
            -------------------------------------------------------- */

            this.surfaceProcesses(
                date,
                dtHours
            );


            /* --------------------------------------------------------
              14. MICROPHYSICS
            -------------------------------------------------------- */

            this.microphysics.step(
                date,
                dtHours
            );


            /* --------------------------------------------------------
              15. LATENT HEATING FEEDBACK ON PRESSURE
            -------------------------------------------------------- */

            this.applyMicrophysicalPressureFeedback(
                dtHours
            );


            /* --------------------------------------------------------
              16. SNOW / GROUND EVOLUTION
            -------------------------------------------------------- */

            this.evolveSnowAndGround(
                date,
                dtHours
            );


            /* --------------------------------------------------------
              17. SST EVOLUTION
            -------------------------------------------------------- */

            this.updateOcean(
                date,
                dtHours
            );


            /* --------------------------------------------------------
              18. FINAL DIAGNOSTICS AND NUMERICAL SAFETY
            -------------------------------------------------------- */

            this.enforceLimits();


            this.a.updateAllThermodynamicDiagnostics();
        }


        /* ============================================================
           DEBUGGING: WHY IS THIS CELL DRY?
        ============================================================ */

        precipitationDiagnosisAt(
            latitude,
            longitude
        ) {

            const position =
                this.t.xyFromLatLon(
                    latitude,
                    longitude
                );


            const x =
                Math.round(
                    position.x
                );


            const y =
                Math.round(
                    position.y
                );


            const cell =
                y *
                this.nx +
                x;


            const micro =
                this.microphysics.diagnosticsAtIndex(
                    cell
                );


            const surface =
                this.a.surface;


            const l925 =
                this.a.level925;


            const l850 =
                this.a.level850;


            const l700 =
                this.a.level700;


            const condensate =
                surface.cloudLiquid[
                    cell
                ] +
                surface.cloudIce[
                    cell
                ] +
                l925.cloudLiquid[
                    cell
                ] +
                l925.cloudIce[
                    cell
                ] +
                l850.cloudLiquid[
                    cell
                ] +
                l850.cloudIce[
                    cell
                ] +
                l700.cloudLiquid[
                    cell
                ] +
                l700.cloudIce[
                    cell
                ];


            let diagnosis;


            if (
                this.a.precipMmHr[
                    cell
                ] >
                0.02
            ) {

                diagnosis =
                    "Precipitation is being produced.";
            }
            else if (
                Math.max(
                    surface.relativeHumidity[
                        cell
                    ],
                    l925.relativeHumidity[
                        cell
                    ],
                    l850.relativeHumidity[
                        cell
                    ]
                ) <
                0.88
            ) {

                diagnosis =
                    "Atmosphere is too dry for significant condensation.";
            }
            else if (
                this.a.totalLift[
                    cell
                ] <
                C.verticalMotion.meaningfulAscentThreshold
            ) {

                diagnosis =
                    "Moisture is present but meaningful ascent is weak.";
            }
            else if (
                condensate <
                C.precipitation.sanityFloor.minimumCondensateKgKg
            ) {

                diagnosis =
                    "Ascent exists but insufficient cloud condensate has formed yet.";
            }
            else if (
                this.a.precipProduction[
                    cell
                ] >
                    0 &&
                this.a.precipMmHr[
                    cell
                ] <=
                    0.02
            ) {

                diagnosis =
                    "Precipitation forms aloft but mostly evaporates before reaching the surface.";
            }
            else {

                diagnosis =
                    "Near-threshold atmospheric state; inspect detailed diagnostics.";
            }


            return {

                lat:
                    latitude,

                lon:
                    longitude,

                diagnosis,

                frontStrength:
                    this.a.frontStrength[
                        cell
                    ],

                convergence:
                    this.a.convergence[
                        cell
                    ],

                tracerContrast:
                    this.a.tracerContrast[
                        cell
                    ],

                temperatureGradientCPer100Km:
                    this.a.temperatureGradient[
                        cell
                    ],

                frontalLift:
                    this.a.frontalLift[
                        cell
                    ],

                orographicLift:
                    this.a.orographicLift[
                        cell
                    ],

                convectiveLift:
                    this.a.convectiveLift[
                        cell
                    ],

                totalLift:
                    this.a.totalLift[
                        cell
                    ],

                totalCloudCondensateKgKg:
                    condensate,

                ...micro
            };
        }
    }


    /* ================================================================
       EXPORT
    ================================================================ */

    global.EuropaPhysics =
        Object.freeze({

            Physics
        });

})(window);
