/*
 * EuropaCraft Atmospheric Simulation
 * V10 Air-Mass Engine
 *
 * NEW FILE
 *
 * Responsibilities:
 *
 * - Define EuropaCraft air-mass source types.
 * - Create controllable air masses.
 * - Inject actual temperature, humidity, momentum and pressure state.
 * - Inject vertical structure through surface / 925 / 850 / 700 hPa.
 * - Preserve source identity through the V10 tracer system.
 * - Support custom and preset air masses.
 *
 * IMPORTANT:
 *
 * An air mass is NOT a painted temperature anomaly.
 *
 * After injection, the atmospheric fields themselves contain the new air.
 * The normal physics engine is responsible for:
 *
 * - advection
 * - deformation
 * - mixing
 * - fronts
 * - convergence
 * - ascent
 * - cloud
 * - precipitation
 *
 * Removing an AirMass record does NOT magically remove the air already
 * injected into the atmosphere.
 */

(function (global) {
    "use strict";


    const C =
        global.EuropaConfig;

    const U =
        global.EuropaUtils;

    const A =
        global.EuropaAtmosphere;


    if (!C) {
        throw new Error(
            "EuropaCraft V10: config.js must load before europacraft-airmasses.js"
        );
    }


    if (!U) {
        throw new Error(
            "EuropaCraft V10: europacraft-utils.js must load before europacraft-airmasses.js"
        );
    }


    if (!A) {
        throw new Error(
            "EuropaCraft V10: europacraft-atmosphere.js must load before europacraft-airmasses.js"
        );
    }


    const TRACER_NAMES =
        A.TRACER_NAMES;

    const TRACER_COUNT =
        TRACER_NAMES.length;

    const LEVEL_KEYS =
        A.LEVEL_KEYS;

    const LEVEL_COUNT =
        LEVEL_KEYS.length;


    /* ================================================================
       SOURCE PRESETS
    ================================================================ */

    /*
     * These are not absolute weather conditions.
     *
     * They describe the CHARACTER of each source type.
     *
     * Explicit user-entered temperature, humidity, wind, pressure or
     * vertical profile always overrides these defaults.
     *
     * temperatureOffsetC:
     * Offset from local hourly climatology when an explicit temperature
     * is not supplied.
     *
     * humidityPct:
     * Typical low-level RH of newly created source air.
     *
     * stability:
     * -1 = strongly unstable
     *  0 = neutral-ish
     * +1 = strongly stable
     *
     * lapseAdjustment is derived from this later.
     */

    const SOURCE_PRESETS = Object.freeze({

        "Atlantic": Object.freeze({
            temperatureOffsetC: 0.5,
            humidityPct: 84,
            stability: -0.05,
            pressureDeltaHpa: -1,
            defaultSpeedKmh: 45
        }),

        "Polar Maritime": Object.freeze({
            temperatureOffsetC: -5.5,
            humidityPct: 86,
            stability: -0.40,
            pressureDeltaHpa: -3,
            defaultSpeedKmh: 50
        }),

        "Arctic Maritime": Object.freeze({
            temperatureOffsetC: -10.0,
            humidityPct: 82,
            stability: -0.30,
            pressureDeltaHpa: -2,
            defaultSpeedKmh: 45
        }),

        "Greenland Ice-Sheet": Object.freeze({
            temperatureOffsetC: -16.0,
            humidityPct: 55,
            stability: 0.55,
            pressureDeltaHpa: 3,
            defaultSpeedKmh: 35
        }),

        "North Sea": Object.freeze({
            temperatureOffsetC: -0.5,
            humidityPct: 88,
            stability: -0.10,
            pressureDeltaHpa: -1,
            defaultSpeedKmh: 38
        }),

        "Baltic Maritime": Object.freeze({
            temperatureOffsetC: -1.0,
            humidityPct: 86,
            stability: 0.05,
            pressureDeltaHpa: 0,
            defaultSpeedKmh: 32
        }),

        "Mediterranean": Object.freeze({
            temperatureOffsetC: 6.0,
            humidityPct: 78,
            stability: 0.05,
            pressureDeltaHpa: -1,
            defaultSpeedKmh: 35
        }),

        "Black Sea": Object.freeze({
            temperatureOffsetC: 3.0,
            humidityPct: 82,
            stability: -0.05,
            pressureDeltaHpa: -1,
            defaultSpeedKmh: 32
        }),

        "Caspian Maritime": Object.freeze({
            temperatureOffsetC: 2.0,
            humidityPct: 75,
            stability: 0.05,
            pressureDeltaHpa: 0,
            defaultSpeedKmh: 28
        }),

        "North African": Object.freeze({
            temperatureOffsetC: 13.0,
            humidityPct: 28,
            stability: 0.10,
            pressureDeltaHpa: 1,
            defaultSpeedKmh: 35
        }),

        "Eurasian Continental": Object.freeze({
            temperatureOffsetC: -5.0,
            humidityPct: 48,
            stability: 0.30,
            pressureDeltaHpa: 4,
            defaultSpeedKmh: 28
        }),

        "British Landmass": Object.freeze({
            temperatureOffsetC: 0.0,
            humidityPct: 76,
            stability: 0.00,
            pressureDeltaHpa: 0,
            defaultSpeedKmh: 30
        }),

        "Iberian Interior": Object.freeze({
            temperatureOffsetC: 6.5,
            humidityPct: 38,
            stability: -0.05,
            pressureDeltaHpa: 1,
            defaultSpeedKmh: 28
        }),

        "West-Central European": Object.freeze({
            temperatureOffsetC: 1.0,
            humidityPct: 64,
            stability: 0.05,
            pressureDeltaHpa: 0,
            defaultSpeedKmh: 28
        }),

        "Central / Eastern European": Object.freeze({
            temperatureOffsetC: -1.5,
            humidityPct: 57,
            stability: 0.15,
            pressureDeltaHpa: 2,
            defaultSpeedKmh: 26
        }),

        "Scandinavian Interior": Object.freeze({
            temperatureOffsetC: -8.0,
            humidityPct: 50,
            stability: 0.25,
            pressureDeltaHpa: 3,
            defaultSpeedKmh: 28
        }),

        "Balkan Modified": Object.freeze({
            temperatureOffsetC: 3.0,
            humidityPct: 58,
            stability: -0.05,
            pressureDeltaHpa: 0,
            defaultSpeedKmh: 27
        }),

        "Anatolian Interior": Object.freeze({
            temperatureOffsetC: 4.5,
            humidityPct: 38,
            stability: 0.10,
            pressureDeltaHpa: 1,
            defaultSpeedKmh: 25
        })
    });


    /* ================================================================
       HELPERS
    ================================================================ */

    function validDate(
        date
    ) {

        if (
            date instanceof Date &&
            Number.isFinite(
                date.getTime()
            )
        ) {
            return date;
        }

        const parsed =
            new Date(date);

        if (
            !Number.isFinite(
                parsed.getTime()
            )
        ) {
            return new Date();
        }

        return parsed;
    }


    function finite(
        value,
        fallback
    ) {

        return (
            Number.isFinite(
                Number(value)
            )
                ? Number(value)
                : fallback
        );
    }


    function makeId(
        random
    ) {

        const a =
            Math.floor(
                random() *
                0xFFFFFF
            )
            .toString(36);

        const b =
            Date.now()
            .toString(36);

        return (
            "AM-" +
            b +
            "-" +
            a
        );
    }


    function presetFor(
        sourceType
    ) {

        return (
            SOURCE_PRESETS[
                sourceType
            ] ||
            SOURCE_PRESETS["Atlantic"]
        );
    }


    function tracerIndex(
        name
    ) {

        const index =
            TRACER_NAMES.indexOf(
                name
            );

        return index;
    }


    function makePureTracerVector(
        sourceType
    ) {

        const vector =
            new Float32Array(
                TRACER_COUNT
            );

        const index =
            tracerIndex(
                sourceType
            );

        if (
            index >= 0
        ) {
            vector[
                index
            ] = 1;
        }
        else {
            vector[0] = 1;
        }

        return vector;
    }


    function makeTracerVector(
        sourceType,
        customMix
    ) {

        if (
            !customMix ||
            typeof customMix !== "object"
        ) {

            return makePureTracerVector(
                sourceType
            );
        }


        const result =
            new Float32Array(
                TRACER_COUNT
            );


        for (
            let i = 0;
            i < TRACER_COUNT;
            i++
        ) {

            result[i] =
                Math.max(
                    0,
                    finite(
                        customMix[
                            TRACER_NAMES[i]
                        ],
                        0
                    )
                );
        }


        U.normalizeWeights(
            result,
            Math.max(
                0,
                tracerIndex(
                    sourceType
                )
            )
        );


        return result;
    }


    function destinationPressure(
        atmosphere,
        levelIndex,
        cellIndex
    ) {

        return atmosphere.pressureAt(
            levelIndex,
            cellIndex
        );
    }


    function verticalBlendFactor(
        levelIndex,
        depthLayers
    ) {

        /*
         * depthLayers:
         *
         * 1 = surface
         * 2 = surface + 925
         * 3 = surface + 925 + 850
         * 4 = surface + 925 + 850 + 700
         */

        if (
            levelIndex >=
            depthLayers
        ) {
            return 0;
        }


        if (
            depthLayers <= 1
        ) {
            return (
                levelIndex === 0
                    ? 1
                    : 0
            );
        }


        /*
         * The deepest included layer is slightly weaker than the lower
         * part of the air mass, producing a natural vertical taper.
         */

        const fraction =
            levelIndex /
            Math.max(
                1,
                depthLayers - 1
            );


        return U.lerp(
            1,
            0.72,
            fraction
        );
    }


    function lapseRateFromStability(
        stability
    ) {

        const s =
            U.clamp(
                stability,
                -1,
                1
            );


        /*
         * Positive stability -> smaller lapse rate.
         * Negative stability -> steeper lapse rate.
         */

        return U.clamp(
            C.vertical.environmentalLapseRateCPerKm -
            1.8 * s,
            3.8,
            9.0
        );
    }


    function defaultRHForLevel(
        surfaceRH,
        levelIndex,
        sourceType
    ) {

        let reduction;

        switch (
            levelIndex
        ) {

            case 0:
                reduction = 0;
                break;

            case 1:
                reduction = 4;
                break;

            case 2:
                reduction = 10;
                break;

            default:
                reduction = 18;
                break;
        }


        /*
         * Maritime masses retain deeper moisture.
         */

        if (
            sourceType === "Atlantic" ||
            sourceType === "Polar Maritime" ||
            sourceType === "Arctic Maritime" ||
            sourceType === "North Sea" ||
            sourceType === "Mediterranean" ||
            sourceType === "Black Sea"
        ) {

            reduction *=
                0.70;
        }


        /*
         * Continental and desert sources dry rapidly aloft.
         */

        if (
            sourceType === "North African" ||
            sourceType === "Iberian Interior" ||
            sourceType === "Eurasian Continental" ||
            sourceType === "Anatolian Interior"
        ) {

            reduction *=
                1.25;
        }


        return U.clamp(
            surfaceRH -
            reduction,
            12,
            100
        );
    }


    function resolveMovement(
        options,
        preset
    ) {

        let speedKmh =
            finite(
                options.speedKmh,
                preset.defaultSpeedKmh
            );


        speedKmh =
            U.clamp(
                speedKmh,
                0,
                250
            );


        let bearingDeg =
            finite(
                options.bearingDeg,
                90
            );


        bearingDeg =
            U.wrapDegrees(
                bearingDeg
            );


        if (
            Number.isFinite(
                Number(
                    options.windUMs
                )
            ) &&
            Number.isFinite(
                Number(
                    options.windVMs
                )
            )
        ) {

            const u =
                Number(
                    options.windUMs
                );

            const v =
                Number(
                    options.windVMs
                );


            return {

                u,

                v,

                speedKmh:
                    Math.hypot(
                        u,
                        v
                    ) *
                    3.6,

                bearingDeg:
                    U.bearingFromVector(
                        u,
                        v
                    )
            };
        }


        const vector =
            U.vectorFromBearingSpeed(
                bearingDeg,
                speedKmh /
                3.6
            );


        return {

            u:
                vector.u,

            v:
                vector.v,

            speedKmh,

            bearingDeg
        };
    }


    /* ================================================================
       AIR MASS
    ================================================================ */

    class AirMass {

        constructor(
            manager,
            options = {}
        ) {

            this.manager =
                manager;


            const random =
                manager.random;


            this.id =
                String(
                    options.id ||
                    makeId(
                        random
                    )
                );


            this.name =
                String(
                    options.name ||
                    options.sourceType ||
                    "Custom air mass"
                );


            this.sourceType =
                TRACER_NAMES.includes(
                    options.sourceType
                )
                    ? options.sourceType
                    : "Atlantic";


            this.preset =
                presetFor(
                    this.sourceType
                );


            this.lat =
                U.clamp(
                    finite(
                        options.lat,
                        50
                    ),
                    C.bounds.south,
                    C.bounds.north
                );


            this.lon =
                U.clamp(
                    finite(
                        options.lon,
                        0
                    ),
                    C.bounds.west,
                    C.bounds.east
                );


            this.radiusKm =
                U.clamp(
                    finite(
                        options.radiusKm,
                        C.airMasses.defaultRadiusKm
                    ),
                    C.airMasses.minimumRadiusKm,
                    C.airMasses.maximumRadiusKm
                );


            this.coreRadiusKm =
                U.clamp(
                    finite(
                        options.coreRadiusKm,
                        this.radiusKm *
                        0.30
                    ),
                    20,
                    this.radiusKm
                );


            this.strength =
                U.clamp01(
                    finite(
                        options.strength,
                        C.airMasses.defaultStrength
                    )
                );


            this.depthLayers =
                Math.round(
                    U.clamp(
                        finite(
                            options.depthLayers,
                            3
                        ),
                        1,
                        LEVEL_COUNT
                    )
                );


            this.stability =
                U.clamp(
                    finite(
                        options.stability,
                        this.preset.stability
                    ),
                    -1,
                    1
                );


            this.lapseRateCPerKm =
                U.clamp(
                    finite(
                        options.lapseRateCPerKm,
                        lapseRateFromStability(
                            this.stability
                        )
                    ),
                    2.5,
                    10
                );


            this.surfaceTemperatureC =
                Number.isFinite(
                    Number(
                        options.temperatureC
                    )
                )
                    ? Number(
                        options.temperatureC
                    )
                    : null;


            this.relativeHumidityPct =
                U.clamp(
                    finite(
                        options.relativeHumidityPct,
                        this.preset.humidityPct
                    ),
                    1,
                    100
                );


            this.specificHumidityKgKg =
                Number.isFinite(
                    Number(
                        options.specificHumidityKgKg
                    )
                )
                    ? U.clamp(
                        Number(
                            options.specificHumidityKgKg
                        ),
                        0,
                        C.limits.specificHumidityMaxKgKg
                    )
                    : null;


            this.pressureHpa =
                Number.isFinite(
                    Number(
                        options.pressureHpa
                    )
                )
                    ? U.clamp(
                        Number(
                            options.pressureHpa
                        ),
                        C.limits.pressureMinHpa,
                        C.limits.pressureMaxHpa
                    )
                    : null;


            this.pressureDeltaHpa =
                U.clamp(
                    finite(
                        options.pressureDeltaHpa,
                        this.preset.pressureDeltaHpa
                    ),
                    -35,
                    35
                );


            this.temperatureProfileC =
                options.temperatureProfileC &&
                typeof options.temperatureProfileC ===
                    "object"
                    ? {
                        ...options.temperatureProfileC
                    }
                    : null;


            this.relativeHumidityProfilePct =
                options.relativeHumidityProfilePct &&
                typeof options.relativeHumidityProfilePct ===
                    "object"
                    ? {
                        ...options.relativeHumidityProfilePct
                    }
                    : null;


            this.windProfile =
                options.windProfile &&
                typeof options.windProfile ===
                    "object"
                    ? {
                        ...options.windProfile
                    }
                    : null;


            this.movement =
                resolveMovement(
                    options,
                    this.preset
                );


            this.tracerVector =
                makeTracerVector(
                    this.sourceType,
                    options.tracerMix
                );


            this.createdAtMs =
                manager.currentDate
                    .getTime();


            this.createdSimulationDate =
                new Date(
                    this.createdAtMs
                );


            this.ageHours =
                0;


            this.lifetimeHours =
                Math.max(
                    C.airMasses.minimumLifetimeHours,
                    finite(
                        options.lifetimeHours,
                        120
                    )
                );


            this.enabled =
                options.enabled !==
                false;


            /*
             * One-shot injection by design.
             *
             * The atmosphere then evolves physically.
             */

            this.injected =
                false;


            this.cellsAffected =
                0;


            this.maximumAppliedWeight =
                0;
        }


        temperatureAtLevel(
            levelIndex,
            cellIndex
        ) {

            const atmosphere =
                this.manager.atmosphere;

            const terrain =
                this.manager.terrain;

            const level =
                atmosphere.levels[
                    levelIndex
                ];


            if (
                this.temperatureProfileC &&
                Number.isFinite(
                    Number(
                        this.temperatureProfileC[
                            level.key
                        ]
                    )
                )
            ) {

                return U.clamp(
                    Number(
                        this.temperatureProfileC[
                            level.key
                        ]
                    ),
                    C.limits.temperatureMinC,
                    C.limits.temperatureMaxC
                );
            }


            let surfaceTemperature =
                this.surfaceTemperatureC;


            if (
                surfaceTemperature ===
                null
            ) {

                const climatology =
                    atmosphere.climatologyAtIndex(
                        cellIndex,
                        this.manager.currentDate
                    );


                surfaceTemperature =
                    climatology +
                    this.preset.temperatureOffsetC;
            }


            if (
                levelIndex === 0
            ) {

                return U.clamp(
                    surfaceTemperature,
                    C.limits.temperatureMinC,
                    C.limits.temperatureMaxC
                );
            }


            const localTerrainHeight =
                Math.max(
                    0,
                    terrain.altitudeM[
                        cellIndex
                    ]
                );


            /*
             * Reconstruct a broad air-mass reference temperature near
             * sea level so higher terrain does not accidentally create a
             * vertically inverted injected profile.
             */

            const seaLevelEquivalent =
                surfaceTemperature +
                this.lapseRateCPerKm *
                localTerrainHeight /
                1000;


            const targetHeight =
                level.approximateHeightM;


            return U.clamp(
                seaLevelEquivalent -
                this.lapseRateCPerKm *
                targetHeight /
                1000,
                C.limits.temperatureMinC,
                C.limits.temperatureMaxC
            );
        }


        humidityAtLevel(
            levelIndex,
            cellIndex,
            targetTemperature
        ) {

            const atmosphere =
                this.manager.atmosphere;

            const level =
                atmosphere.levels[
                    levelIndex
                ];


            const pressure =
                destinationPressure(
                    atmosphere,
                    levelIndex,
                    cellIndex
                );


            if (
                levelIndex === 0 &&
                this.specificHumidityKgKg !==
                    null
            ) {

                return this.specificHumidityKgKg;
            }


            let rhPct;


            if (
                this.relativeHumidityProfilePct &&
                Number.isFinite(
                    Number(
                        this.relativeHumidityProfilePct[
                            level.key
                        ]
                    )
                )
            ) {

                rhPct =
                    Number(
                        this.relativeHumidityProfilePct[
                            level.key
                        ]
                    );
            }
            else {

                rhPct =
                    defaultRHForLevel(
                        this.relativeHumidityPct,
                        levelIndex,
                        this.sourceType
                    );
            }


            rhPct =
                U.clamp(
                    rhPct,
                    1,
                    100
                );


            return U.clamp(
                U.qsatFromTempPressure(
                    targetTemperature,
                    pressure
                ) *
                rhPct /
                100,
                0,
                C.limits.specificHumidityMaxKgKg
            );
        }


        windAtLevel(
            levelIndex
        ) {

            const key =
                LEVEL_KEYS[
                    levelIndex
                ];


            if (
                this.windProfile &&
                this.windProfile[
                    key
                ]
            ) {

                const profile =
                    this.windProfile[
                        key
                    ];


                if (
                    Number.isFinite(
                        Number(
                            profile.u
                        )
                    ) &&
                    Number.isFinite(
                        Number(
                            profile.v
                        )
                    )
                ) {

                    return {

                        u:
                            Number(
                                profile.u
                            ),

                        v:
                            Number(
                                profile.v
                            )
                    };
                }


                if (
                    Number.isFinite(
                        Number(
                            profile.speedKmh
                        )
                    ) &&
                    Number.isFinite(
                        Number(
                            profile.bearingDeg
                        )
                    )
                ) {

                    return U.vectorFromBearingSpeed(
                        U.wrapDegrees(
                            Number(
                                profile.bearingDeg
                            )
                        ),
                        Number(
                            profile.speedKmh
                        ) /
                        3.6
                    );
                }
            }


            /*
             * Broad vertical increase in wind without forcing a large
             * directional shear.
             */

            const speedMultiplier =
                [
                    0.82,
                    1.00,
                    1.15,
                    1.32
                ][
                    levelIndex
                ];


            return {

                u:
                    this.movement.u *
                    speedMultiplier,

                v:
                    this.movement.v *
                    speedMultiplier
            };
        }
    }


    /* ================================================================
       AIR MASS MANAGER
    ================================================================ */

    class AirMassManager {

        constructor(
            terrain,
            atmosphere,
            options = {}
        ) {

            if (!terrain) {

                throw new Error(
                    "EuropaCraft V10 AirMassManager requires terrain."
                );
            }


            if (!atmosphere) {

                throw new Error(
                    "EuropaCraft V10 AirMassManager requires atmosphere."
                );
            }


            this.terrain =
                terrain;

            this.atmosphere =
                atmosphere;

            this.random =
                U.seededRandom(
                    Number(
                        options.seed
                    ) ||
                    20261001
                );


            this.currentDate =
                validDate(
                    options.date ||
                    new Date()
                );


            this.masses =
                [];


            this.creationCounter =
                0;


            /*
             * Reusable temporary tracer vectors.
             */

            this._existingTracer =
                new Float32Array(
                    TRACER_COUNT
                );

            this._mixedTracer =
                new Float32Array(
                    TRACER_COUNT
                );
        }


        /* ============================================================
           CREATE
        ============================================================ */

        create(
            options = {}
        ) {

            this.currentDate =
                validDate(
                    options.date ||
                    this.currentDate
                );


            if (
                this.masses.length >=
                C.airMasses.maxInjectedMasses
            ) {

                /*
                 * Remove the oldest record only.
                 *
                 * Atmospheric state already injected by that mass remains.
                 */

                this.masses.shift();
            }


            const airMass =
                new AirMass(
                    this,
                    options
                );


            this.creationCounter++;


            this.masses.push(
                airMass
            );


            if (
                options.inject !==
                false
            ) {

                this.inject(
                    airMass
                );
            }


            return airMass;
        }


        createPreset(
            sourceType,
            latitude,
            longitude,
            options = {}
        ) {

            return this.create({

                ...options,

                sourceType,

                lat:
                    latitude,

                lon:
                    longitude
            });
        }


        /* ============================================================
           INJECTION WEIGHT
        ============================================================ */

        spatialWeight(
            airMass,
            latitude,
            longitude
        ) {

            const distance =
                U.haversineKm(
                    airMass.lat,
                    airMass.lon,
                    latitude,
                    longitude
                );


            if (
                distance >=
                airMass.radiusKm
            ) {
                return 0;
            }


            /*
             * Strong central body with a broad smooth transition zone.
             *
             * No hard circular discontinuity is created.
             */

            let weight;


            if (
                distance <=
                airMass.coreRadiusKm
            ) {

                const coreFraction =
                    distance /
                    Math.max(
                        1,
                        airMass.coreRadiusKm
                    );


                weight =
                    U.lerp(
                        1,
                        0.90,
                        coreFraction
                    );
            }
            else {

                const edgeFraction =
                    (
                        distance -
                        airMass.coreRadiusKm
                    ) /
                    Math.max(
                        1,
                        airMass.radiusKm -
                        airMass.coreRadiusKm
                    );


                weight =
                    0.90 *
                    (
                        1 -
                        U.smootherstep(
                            0,
                            1,
                            edgeFraction
                        )
                    );
            }


            return U.clamp01(
                weight *
                airMass.strength
            );
        }


        /* ============================================================
           INJECT
        ============================================================ */

        inject(
            airMassOrId
        ) {

            const airMass =
                typeof airMassOrId ===
                    "string"
                    ? this.get(
                        airMassOrId
                    )
                    : airMassOrId;


            if (
                !airMass ||
                !airMass.enabled
            ) {
                return false;
            }


            const atmosphere =
                this.atmosphere;

            const terrain =
                this.terrain;


            let affected =
                0;

            let maximumWeight =
                0;


            for (
                let cell = 0;
                cell < terrain.n;
                cell++
            ) {

                const spatialWeight =
                    this.spatialWeight(
                        airMass,
                        terrain.lat[
                            cell
                        ],
                        terrain.lon[
                            cell
                        ]
                    );


                if (
                    spatialWeight <=
                    0.0005
                ) {
                    continue;
                }


                affected++;


                maximumWeight =
                    Math.max(
                        maximumWeight,
                        spatialWeight
                    );


                /* ----------------------------------------------------
                   VERTICAL ATMOSPHERIC STATE
                ---------------------------------------------------- */

                for (
                    let levelIndex = 0;
                    levelIndex < LEVEL_COUNT;
                    levelIndex++
                ) {

                    const verticalWeight =
                        verticalBlendFactor(
                            levelIndex,
                            airMass.depthLayers
                        );


                    if (
                        verticalWeight <=
                        0
                    ) {
                        continue;
                    }


                    const weight =
                        U.clamp01(
                            spatialWeight *
                            verticalWeight
                        );


                    const level =
                        atmosphere.levels[
                            levelIndex
                        ];


                    const targetTemperature =
                        airMass.temperatureAtLevel(
                            levelIndex,
                            cell
                        );


                    const targetQ =
                        airMass.humidityAtLevel(
                            levelIndex,
                            cell,
                            targetTemperature
                        );


                    const targetWind =
                        airMass.windAtLevel(
                            levelIndex
                        );


                    /*
                     * TEMPERATURE
                     */

                    level.tempC[
                        cell
                    ] =
                        U.lerp(
                            level.tempC[
                                cell
                            ],
                            targetTemperature,
                            weight
                        );


                    /*
                     * WATER VAPOUR
                     */

                    level.q[
                        cell
                    ] =
                        U.clamp(
                            U.lerp(
                                level.q[
                                    cell
                                ],
                                targetQ,
                                weight
                            ),
                            0,
                            C.limits.specificHumidityMaxKgKg
                        );


                    /*
                     * MOMENTUM
                     *
                     * The mass therefore actually arrives with motion.
                     */

                    level.u[
                        cell
                    ] =
                        U.lerp(
                            level.u[
                                cell
                            ],
                            targetWind.u,
                            weight
                        );


                    level.v[
                        cell
                    ] =
                        U.lerp(
                            level.v[
                                cell
                            ],
                            targetWind.v,
                            weight
                        );


                    /*
                     * AIR-MASS TRACERS
                     */

                    level.getTracerVector(
                        cell,
                        this._existingTracer
                    );


                    for (
                        let tracer = 0;
                        tracer < TRACER_COUNT;
                        tracer++
                    ) {

                        this._mixedTracer[
                            tracer
                        ] =
                            U.lerp(
                                this._existingTracer[
                                    tracer
                                ],
                                airMass.tracerVector[
                                    tracer
                                ],
                                weight
                            );
                    }


                    U.normalizeWeights(
                        this._mixedTracer
                    );


                    level.setTracerVector(
                        cell,
                        this._mixedTracer
                    );
                }


                /* ----------------------------------------------------
                   SURFACE PRESSURE
                ---------------------------------------------------- */

                if (
                    airMass.pressureHpa !==
                    null
                ) {

                    atmosphere.pressureHpa[
                        cell
                    ] =
                        U.clamp(
                            U.lerp(
                                atmosphere.pressureHpa[
                                    cell
                                ],
                                airMass.pressureHpa,
                                spatialWeight
                            ),
                            C.limits.pressureMinHpa,
                            C.limits.pressureMaxHpa
                        );
                }
                else if (
                    Math.abs(
                        airMass.pressureDeltaHpa
                    ) >
                    0.001
                ) {

                    /*
                     * Pressure delta is intentionally softer than the
                     * thermodynamic blending.
                     *
                     * We want a physically useful pressure perturbation,
                     * not a mathematically sharp artificial pressure wall.
                     */

                    atmosphere.pressureHpa[
                        cell
                    ] =
                        U.clamp(
                            atmosphere.pressureHpa[
                                cell
                            ] +
                            airMass.pressureDeltaHpa *
                            spatialWeight *
                            0.60,
                            C.limits.pressureMinHpa,
                            C.limits.pressureMaxHpa
                        );
                }
            }


            airMass.injected =
                true;

            airMass.cellsAffected =
                affected;

            airMass.maximumAppliedWeight =
                maximumWeight;


            /*
             * Recalculate RH, wet bulb and cloud diagnostics immediately.
             *
             * Cloud water itself is NOT magically created here.
             * Saturation/ascent will create condensate in microphysics.
             */

            atmosphere.updateAllThermodynamicDiagnostics();


            return true;
        }


        /* ============================================================
           CUSTOM COLLISION TEST
        ============================================================ */

        createCollisionPair(
            options = {}
        ) {

            /*
             * Development helper.
             *
             * Creates two genuinely different masses moving toward one
             * another. Later V10 physics must create the front and weather.
             *
             * This does NOT directly create cloud or precipitation.
             */


            const latitude =
                finite(
                    options.lat,
                    52
                );


            const centerLongitude =
                finite(
                    options.lon,
                    5
                );


            const separationDegrees =
                finite(
                    options.separationDegrees,
                    12
                );


            const westernSource =
                options.westernSource ||
                "Atlantic";


            const easternSource =
                options.easternSource ||
                "Eurasian Continental";


            const western =
                this.create({

                    name:
                        options.westernName ||
                        "Collision Test - Western",

                    sourceType:
                        westernSource,

                    lat:
                        latitude,

                    lon:
                        centerLongitude -
                        separationDegrees /
                        2,

                    radiusKm:
                        finite(
                            options.radiusKm,
                            720
                        ),

                    strength:
                        finite(
                            options.strength,
                            0.95
                        ),

                    depthLayers:
                        finite(
                            options.depthLayers,
                            3
                        ),

                    temperatureC:
                        Number.isFinite(
                            Number(
                                options.westernTemperatureC
                            )
                        )
                            ? Number(
                                options.westernTemperatureC
                            )
                            : null,

                    relativeHumidityPct:
                        finite(
                            options.westernHumidityPct,
                            92
                        ),

                    bearingDeg:
                        90,

                    speedKmh:
                        finite(
                            options.speedKmh,
                            55
                        ),

                    pressureDeltaHpa:
                        finite(
                            options.westernPressureDeltaHpa,
                            -2
                        )
                });


            const eastern =
                this.create({

                    name:
                        options.easternName ||
                        "Collision Test - Eastern",

                    sourceType:
                        easternSource,

                    lat:
                        latitude,

                    lon:
                        centerLongitude +
                        separationDegrees /
                        2,

                    radiusKm:
                        finite(
                            options.radiusKm,
                            720
                        ),

                    strength:
                        finite(
                            options.strength,
                            0.95
                        ),

                    depthLayers:
                        finite(
                            options.depthLayers,
                            3
                        ),

                    temperatureC:
                        Number.isFinite(
                            Number(
                                options.easternTemperatureC
                            )
                        )
                            ? Number(
                                options.easternTemperatureC
                            )
                            : null,

                    relativeHumidityPct:
                        finite(
                            options.easternHumidityPct,
                            76
                        ),

                    bearingDeg:
                        270,

                    speedKmh:
                        finite(
                            options.speedKmh,
                            55
                        ),

                    pressureDeltaHpa:
                        finite(
                            options.easternPressureDeltaHpa,
                            3
                        )
                });


            return {
                western,
                eastern
            };
        }


        /* ============================================================
           RECORD MANAGEMENT
        ============================================================ */

        get(
            id
        ) {

            return (
                this.masses.find(
                    mass =>
                        mass.id === id
                ) ||
                null
            );
        }


        remove(
            id
        ) {

            const before =
                this.masses.length;


            this.masses =
                this.masses.filter(
                    mass =>
                        mass.id !== id
                );


            return (
                this.masses.length !==
                before
            );
        }


        clear() {

            /*
             * Clears records only.
             *
             * Injected atmospheric state remains because it is now part of
             * the simulated atmosphere.
             */

            this.masses.length =
                0;
        }


        setEnabled(
            id,
            enabled
        ) {

            const mass =
                this.get(
                    id
                );


            if (!mass) {
                return false;
            }


            mass.enabled =
                !!enabled;


            return true;
        }


        /* ============================================================
           TIME
        ============================================================ */

        step(
            date,
            dtHours
        ) {

            this.currentDate =
                validDate(
                    date
                );


            const hours =
                Math.max(
                    0,
                    finite(
                        dtHours,
                        0
                    )
                );


            for (
                const mass of this.masses
            ) {

                mass.ageHours +=
                    hours;
            }


            /*
             * Expiring the record does not remove the physical atmosphere.
             */

            this.masses =
                this.masses.filter(
                    mass =>
                        mass.ageHours <=
                        mass.lifetimeHours
                );
        }


        /* ============================================================
           UI / DIAGNOSTICS SERIALIZATION
        ============================================================ */

        describe(
            airMassOrId
        ) {

            const mass =
                typeof airMassOrId ===
                    "string"
                    ? this.get(
                        airMassOrId
                    )
                    : airMassOrId;


            if (!mass) {
                return null;
            }


            const dominantTracer =
                U.dominantWeightIndex(
                    mass.tracerVector
                );


            return {

                id:
                    mass.id,

                name:
                    mass.name,

                sourceType:
                    mass.sourceType,

                latitude:
                    mass.lat,

                longitude:
                    mass.lon,

                radiusKm:
                    mass.radiusKm,

                coreRadiusKm:
                    mass.coreRadiusKm,

                strength:
                    mass.strength,

                depthLayers:
                    mass.depthLayers,

                stability:
                    mass.stability,

                lapseRateCPerKm:
                    mass.lapseRateCPerKm,

                temperatureC:
                    mass.surfaceTemperatureC,

                relativeHumidityPct:
                    mass.relativeHumidityPct,

                pressureHpa:
                    mass.pressureHpa,

                pressureDeltaHpa:
                    mass.pressureDeltaHpa,

                speedKmh:
                    mass.movement.speedKmh,

                bearingDeg:
                    mass.movement.bearingDeg,

                windUMs:
                    mass.movement.u,

                windVMs:
                    mass.movement.v,

                dominantTracer:
                    dominantTracer >= 0
                        ? TRACER_NAMES[
                            dominantTracer
                        ]
                        : null,

                ageHours:
                    mass.ageHours,

                lifetimeHours:
                    mass.lifetimeHours,

                injected:
                    mass.injected,

                cellsAffected:
                    mass.cellsAffected,

                maximumAppliedWeight:
                    mass.maximumAppliedWeight
            };
        }


        list() {

            return this.masses.map(
                mass =>
                    this.describe(
                        mass
                    )
            );
        }
    }


    /* ================================================================
       EXPORT
    ================================================================ */

    global.EuropaAirMasses =
        Object.freeze({

            AirMass,

            AirMassManager,

            SOURCE_PRESETS,

            sourceTypes:
                Object.freeze(
                    TRACER_NAMES.slice()
                )
        });

})(window);
