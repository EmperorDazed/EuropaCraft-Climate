/*
 * EuropaCraft Atmospheric Simulation
 * V10 Synoptic Engine
 *
 * Responsibilities:
 *
 * - Broad low-pressure and high-pressure systems.
 * - Realistic system development, maturity and filling.
 * - Movement of synoptic systems across the European domain.
 * - User steering arrows that apply momentum, not temperature.
 * - Pressure targets/forcing for the prognostic dynamics engine.
 *
 * IMPORTANT:
 *
 * Synoptic systems do NOT directly paint weather.
 *
 * They influence:
 *   pressure evolution
 *   horizontal wind
 *   convergence/divergence
 *
 * The physics engine then determines:
 *   fronts
 *   ascent
 *   cloud
 *   precipitation
 */

(function (global) {
    "use strict";


    const C =
        global.EuropaConfig;

    const U =
        global.EuropaUtils;


    if (!C) {
        throw new Error(
            "EuropaCraft V10: config.js must load before europacraft-synoptic.js"
        );
    }


    if (!U) {
        throw new Error(
            "EuropaCraft V10: europacraft-utils.js must load before europacraft-synoptic.js"
        );
    }


    /* ================================================================
       CONSTANTS
    ================================================================ */

    const SYSTEM_MARGIN_DEG =
        14;

    const DEFAULT_BASE_PRESSURE_HPA =
        1015;


    /* ================================================================
       HELPERS
    ================================================================ */

    function finite(
        value,
        fallback
    ) {

        const number =
            Number(value);

        return (
            Number.isFinite(number)
                ? number
                : fallback
        );
    }


    function createId(
        prefix,
        random
    ) {

        return (
            prefix +
            "-" +
            Date.now().toString(36) +
            "-" +
            Math.floor(
                random() *
                0xFFFFFF
            ).toString(36)
        );
    }


    function validDate(
        value
    ) {

        if (
            value instanceof Date &&
            Number.isFinite(
                value.getTime()
            )
        ) {
            return value;
        }


        const date =
            new Date(value);


        if (
            Number.isFinite(
                date.getTime()
            )
        ) {
            return date;
        }


        return new Date();
    }


    function movementVector(
        options,
        defaultBearing,
        defaultSpeedKmh
    ) {

        if (
            Number.isFinite(
                Number(
                    options.driftUMs
                )
            ) &&
            Number.isFinite(
                Number(
                    options.driftVMs
                )
            )
        ) {

            return {

                u:
                    Number(
                        options.driftUMs
                    ),

                v:
                    Number(
                        options.driftVMs
                    )
            };
        }


        const bearing =
            U.wrapDegrees(
                finite(
                    options.bearingDeg,
                    defaultBearing
                )
            );


        const speedKmh =
            Math.max(
                0,
                finite(
                    options.speedKmh,
                    defaultSpeedKmh
                )
            );


        return U.vectorFromBearingSpeed(
            bearing,
            speedKmh /
            3.6
        );
    }


    /* ================================================================
       PRESSURE SYSTEM
    ================================================================ */

    class PressureSystem {

        constructor(
            synoptic,
            options = {}
        ) {

            this.synoptic =
                synoptic;


            this.id =
                String(
                    options.id ||
                    createId(
                        "SYS",
                        synoptic.random
                    )
                );


            this.name =
                String(
                    options.name ||
                    "Synoptic system"
                );


            this.kind =
                options.kind === "high"
                    ? "high"
                    : "low";


            this.lat =
                finite(
                    options.lat,
                    55
                );


            this.lon =
                finite(
                    options.lon,
                    -10
                );


            this.radiusKm =
                U.clamp(
                    finite(
                        options.radiusKm,
                        1000
                    ),
                    250,
                    3000
                );


            this.coreRadiusKm =
                U.clamp(
                    finite(
                        options.coreRadiusKm,
                        this.radiusKm *
                        0.28
                    ),
                    80,
                    this.radiusKm
                );


            const defaultPressure =
                this.kind === "low"
                    ? 990
                    : 1028;


            this.centralPressureHpa =
                U.clamp(
                    finite(
                        options.centralPressureHpa,
                        defaultPressure
                    ),
                    C.limits.pressureMinHpa,
                    C.limits.pressureMaxHpa
                );


            this.backgroundPressureHpa =
                U.clamp(
                    finite(
                        options.backgroundPressureHpa,
                        DEFAULT_BASE_PRESSURE_HPA
                    ),
                    980,
                    1045
                );


            this.strength =
                U.clamp01(
                    finite(
                        options.strength,
                        1
                    )
                );


            this.movement =
                movementVector(
                    options,
                    80,
                    this.kind === "low"
                        ? 38
                        : 22
                );


            /*
             * Synoptic lifecycle.
             *
             * Development:
             * system gradually strengthens.
             *
             * Mature:
             * strongest phase.
             *
             * Filling:
             * forcing weakens progressively.
             */

            this.developmentHours =
                Math.max(
                    0.5,
                    finite(
                        options.developmentHours,
                        this.kind === "low"
                            ? 18
                            : 30
                    )
                );


            this.matureHours =
                Math.max(
                    0,
                    finite(
                        options.matureHours,
                        this.kind === "low"
                            ? 42
                            : 72
                    )
                );


            this.fillingHours =
                Math.max(
                    1,
                    finite(
                        options.fillingHours,
                        this.kind === "low"
                            ? 48
                            : 72
                    )
                );


            this.ageHours =
                Math.max(
                    0,
                    finite(
                        options.ageHours,
                        0
                    )
                );


            this.enabled =
                options.enabled !==
                false;


            this.userCreated =
                options.userCreated ===
                true;
        }


        get lifetimeHours() {

            return (
                this.developmentHours +
                this.matureHours +
                this.fillingHours
            );
        }


        lifecycleFactor() {

            if (
                this.ageHours <
                0
            ) {
                return 0;
            }


            if (
                this.ageHours <
                this.developmentHours
            ) {

                return U.smootherstep(
                    0,
                    this.developmentHours,
                    this.ageHours
                );
            }


            const matureEnd =
                this.developmentHours +
                this.matureHours;


            if (
                this.ageHours <=
                matureEnd
            ) {

                return 1;
            }


            const end =
                matureEnd +
                this.fillingHours;


            if (
                this.ageHours >=
                end
            ) {

                return 0;
            }


            return (
                1 -
                U.smootherstep(
                    matureEnd,
                    end,
                    this.ageHours
                )
            );
        }


        anomalyHpa() {

            return (
                this.centralPressureHpa -
                this.backgroundPressureHpa
            );
        }


        move(
            dtHours
        ) {

            const eastKm =
                this.movement.u *
                3.6 *
                dtHours;


            const northKm =
                this.movement.v *
                3.6 *
                dtHours;


            const next =
                U.offsetLatLon(
                    this.lat,
                    this.lon,
                    eastKm,
                    northKm
                );


            this.lat =
                next.lat;

            this.lon =
                next.lon;


            this.ageHours +=
                dtHours;
        }


        isExpired() {

            return (
                this.ageHours >
                this.lifetimeHours
            );
        }


        isFarOutsideDomain() {

            return (
                this.lon <
                    C.bounds.west -
                    SYSTEM_MARGIN_DEG ||
                this.lon >
                    C.bounds.east +
                    SYSTEM_MARGIN_DEG ||
                this.lat <
                    C.bounds.south -
                    SYSTEM_MARGIN_DEG ||
                this.lat >
                    C.bounds.north +
                    SYSTEM_MARGIN_DEG
            );
        }
    }


    /* ================================================================
       STEERING ARROW
    ================================================================ */

    class SteeringArrow {

        constructor(
            synoptic,
            startLat,
            startLon,
            endLat,
            endLon,
            options = {}
        ) {

            this.synoptic =
                synoptic;


            this.id =
                String(
                    options.id ||
                    createId(
                        "ARROW",
                        synoptic.random
                    )
                );


            this.startLat =
                finite(
                    startLat,
                    50
                );

            this.startLon =
                finite(
                    startLon,
                    0
                );

            this.endLat =
                finite(
                    endLat,
                    this.startLat
                );

            this.endLon =
                finite(
                    endLon,
                    this.startLon + 5
                );


            this.widthKm =
                U.clamp(
                    finite(
                        options.widthKm,
                        C.forcing.arrowDefaultWidthKm
                    ),
                    75,
                    3000
                );


            this.speedKmh =
                U.clamp(
                    finite(
                        options.speedKmh,
                        C.forcing.arrowDefaultSpeedKmh
                    ),
                    0,
                    C.forcing.arrowMaximumSpeedKmh
                );


            this.strength =
                U.clamp01(
                    finite(
                        options.strength,
                        C.forcing.arrowDefaultStrength
                    )
                );


            this.enabled =
                options.enabled !==
                false;


            this.ageHours =
                0;


            this.lifetimeHours =
                Number.isFinite(
                    Number(
                        options.lifetimeHours
                    )
                )
                    ? Math.max(
                        0.1,
                        Number(
                            options.lifetimeHours
                        )
                    )
                    : Infinity;


            /*
             * Vertical influence.
             *
             * By default an arrow strongly steers the lower atmosphere
             * and progressively less strongly aloft.
             */

            this.levelWeights =
                Array.isArray(
                    options.levelWeights
                )
                    ? [
                        0,
                        1,
                        2,
                        3
                    ].map(
                        index =>
                            U.clamp01(
                                finite(
                                    options.levelWeights[
                                        index
                                    ],
                                    [
                                        1,
                                        1,
                                        0.82,
                                        0.62
                                    ][index]
                                )
                            )
                    )
                    : [
                        1,
                        1,
                        0.82,
                        0.62
                    ];


            const bearing =
                U.bearingDeg(
                    this.startLat,
                    this.startLon,
                    this.endLat,
                    this.endLon
                );


            const vector =
                U.vectorFromBearingSpeed(
                    bearing,
                    this.speedKmh /
                    3.6
                );


            this.bearingDeg =
                bearing;

            this.u =
                vector.u;

            this.v =
                vector.v;
        }


        levelWeight(
            levelIndex
        ) {

            return (
                this.levelWeights[
                    levelIndex
                ] ??
                0
            );
        }


        isExpired() {

            return (
                this.ageHours >
                this.lifetimeHours
            );
        }
    }


    /* ================================================================
       SYNOPTIC ENGINE
    ================================================================ */

    class Synoptic {

        constructor(
            terrain,
            options = {}
        ) {

            if (!terrain) {

                throw new Error(
                    "EuropaCraft V10 Synoptic requires terrain."
                );
            }


            this.terrain =
                terrain;


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


            this.systems =
                [];


            this.arrows =
                [];


            if (
                options.seedDefaultSystems !==
                false
            ) {

                this.seedDefaultSystems();
            }
        }


        /* ============================================================
           DEFAULT SYNOPTIC ENVIRONMENT
        ============================================================ */

        seedDefaultSystems() {

            this.systems.length =
                0;


            /*
             * North Atlantic low.
             *
             * It begins partially developed so the initial model does not
             * start with an unrealistically flat pressure field.
             */

            this.addSystem({

                name:
                    "North Atlantic Low",

                kind:
                    "low",

                lat:
                    58,

                lon:
                    -19,

                radiusKm:
                    1200,

                coreRadiusKm:
                    330,

                centralPressureHpa:
                    988,

                strength:
                    0.88,

                bearingDeg:
                    78,

                speedKmh:
                    34,

                developmentHours:
                    18,

                matureHours:
                    48,

                fillingHours:
                    54,

                ageHours:
                    12
            });


            /*
             * Azores / subtropical ridge.
             */

            this.addSystem({

                name:
                    "Atlantic Subtropical High",

                kind:
                    "high",

                lat:
                    37,

                lon:
                    -14,

                radiusKm:
                    1450,

                coreRadiusKm:
                    440,

                centralPressureHpa:
                    1028,

                strength:
                    0.72,

                bearingDeg:
                    65,

                speedKmh:
                    12,

                developmentHours:
                    36,

                matureHours:
                    90,

                fillingHours:
                    84,

                ageHours:
                    40
            });


            /*
             * Weak continental high.
             */

            this.addSystem({

                name:
                    "Eastern European High",

                kind:
                    "high",

                lat:
                    55,

                lon:
                    34,

                radiusKm:
                    1050,

                coreRadiusKm:
                    320,

                centralPressureHpa:
                    1023,

                strength:
                    0.48,

                bearingDeg:
                    260,

                speedKmh:
                    8,

                developmentHours:
                    36,

                matureHours:
                    72,

                fillingHours:
                    72,

                ageHours:
                    28
            });
        }


        /* ============================================================
           PRESSURE SYSTEM MANAGEMENT
        ============================================================ */

        addSystem(
            options = {}
        ) {

            const system =
                new PressureSystem(
                    this,
                    {
                        ...options,

                        userCreated:
                            options.userCreated ===
                            true
                    }
                );


            this.systems.push(
                system
            );


            return system;
        }


        addLow(
            latitude,
            longitude,
            centralPressureHpa = 990,
            options = {}
        ) {

            return this.addSystem({

                ...options,

                kind:
                    "low",

                lat:
                    latitude,

                lon:
                    longitude,

                centralPressureHpa,

                userCreated:
                    true
            });
        }


        addHigh(
            latitude,
            longitude,
            centralPressureHpa = 1028,
            options = {}
        ) {

            return this.addSystem({

                ...options,

                kind:
                    "high",

                lat:
                    latitude,

                lon:
                    longitude,

                centralPressureHpa,

                userCreated:
                    true
            });
        }


        getSystem(
            id
        ) {

            return (
                this.systems.find(
                    system =>
                        system.id === id
                ) ||
                null
            );
        }


        removeSystem(
            id
        ) {

            const previousLength =
                this.systems.length;


            this.systems =
                this.systems.filter(
                    system =>
                        system.id !== id
                );


            return (
                this.systems.length !==
                previousLength
            );
        }


        clearSystems() {

            this.systems.length =
                0;
        }


        /* ============================================================
           SYSTEM SPATIAL STRUCTURE
        ============================================================ */

        systemWeight(
            system,
            latitude,
            longitude
        ) {

            if (
                !system.enabled
            ) {
                return 0;
            }


            const distance =
                U.haversineKm(
                    latitude,
                    longitude,
                    system.lat,
                    system.lon
                );


            if (
                distance >=
                system.radiusKm *
                1.35
            ) {

                return 0;
            }


            let spatial;


            if (
                distance <=
                system.coreRadiusKm
            ) {

                spatial =
                    U.lerp(
                        1,
                        0.94,
                        distance /
                        Math.max(
                            1,
                            system.coreRadiusKm
                        )
                    );
            }
            else {

                spatial =
                    U.gaussian(
                        distance -
                        system.coreRadiusKm,
                        (
                            system.radiusKm -
                            system.coreRadiusKm
                        ) *
                        0.55
                    ) *
                    0.94;
            }


            return U.clamp01(
                spatial *
                system.strength *
                system.lifecycleFactor()
            );
        }


        /* ============================================================
           PRESSURE SIGNAL
        ============================================================ */

        pressureSignalAt(
            latitude,
            longitude,
            basePressureHpa = DEFAULT_BASE_PRESSURE_HPA
        ) {

            let anomaly =
                0;

            let totalWeight =
                0;

            let strongestSystem =
                null;

            let strongestWeight =
                0;


            for (
                const system of this.systems
            ) {

                const weight =
                    this.systemWeight(
                        system,
                        latitude,
                        longitude
                    );


                if (
                    weight <=
                    0.0001
                ) {
                    continue;
                }


                const systemAnomaly =
                    system.centralPressureHpa -
                    system.backgroundPressureHpa;


                anomaly +=
                    systemAnomaly *
                    weight;


                totalWeight +=
                    weight;


                if (
                    weight >
                    strongestWeight
                ) {

                    strongestWeight =
                        weight;

                    strongestSystem =
                        system;
                }
            }


            /*
             * Overlapping pressure systems should interact without simply
             * producing absurd arithmetic sums.
             */

            if (
                totalWeight >
                1.6
            ) {

                anomaly *=
                    1.6 /
                    totalWeight;
            }


            const targetPressure =
                U.clamp(
                    basePressureHpa +
                    anomaly,
                    C.limits.pressureMinHpa,
                    C.limits.pressureMaxHpa
                );


            return {

                targetPressureHpa:
                    targetPressure,

                anomalyHpa:
                    targetPressure -
                    basePressureHpa,

                totalWeight,

                dominantSystemId:
                    strongestSystem
                        ? strongestSystem.id
                        : null,

                dominantSystem:
                    strongestSystem,

                dominantWeight:
                    strongestWeight
            };
        }


        /* ============================================================
           STEERING ARROWS
        ============================================================ */

        addArrow(
            startLat,
            startLon,
            endLat,
            endLon,
            options = {}
        ) {

            if (
                this.arrows.length >=
                C.forcing.maxSteeringArrows
            ) {

                this.arrows.shift();
            }


            const arrow =
                new SteeringArrow(
                    this,
                    startLat,
                    startLon,
                    endLat,
                    endLon,
                    options
                );


            this.arrows.push(
                arrow
            );


            return arrow;
        }


        getArrow(
            id
        ) {

            return (
                this.arrows.find(
                    arrow =>
                        arrow.id === id
                ) ||
                null
            );
        }


        removeArrow(
            id
        ) {

            const previousLength =
                this.arrows.length;


            this.arrows =
                this.arrows.filter(
                    arrow =>
                        arrow.id !== id
                );


            return (
                this.arrows.length !==
                previousLength
            );
        }


        clearArrows() {

            this.arrows.length =
                0;
        }


        arrowWeight(
            arrow,
            latitude,
            longitude,
            levelIndex
        ) {

            if (
                !arrow.enabled
            ) {
                return 0;
            }


            const levelWeight =
                arrow.levelWeight(
                    levelIndex
                );


            if (
                levelWeight <=
                0
            ) {
                return 0;
            }


            const distance =
                U.pointSegmentDistanceKm(
                    latitude,
                    longitude,
                    arrow.startLat,
                    arrow.startLon,
                    arrow.endLat,
                    arrow.endLon
                );


            const sigma =
                Math.max(
                    25,
                    arrow.widthKm *
                    0.38
                );


            const crossFlowWeight =
                U.gaussian(
                    distance,
                    sigma
                );


            /*
             * Prevent an enormous low-weight mathematical tail from
             * affecting the entire model.
             */

            if (
                crossFlowWeight <
                0.002
            ) {
                return 0;
            }


            return U.clamp(
                crossFlowWeight *
                arrow.strength *
                levelWeight,
                0,
                2
            );
        }


        steeringAt(
            latitude,
            longitude,
            levelIndex = 0
        ) {

            let weightedU =
                0;

            let weightedV =
                0;

            let totalWeight =
                0;


            for (
                const arrow of this.arrows
            ) {

                const weight =
                    this.arrowWeight(
                        arrow,
                        latitude,
                        longitude,
                        levelIndex
                    );


                if (
                    weight <=
                    0
                ) {
                    continue;
                }


                weightedU +=
                    arrow.u *
                    weight;


                weightedV +=
                    arrow.v *
                    weight;


                totalWeight +=
                    weight;
            }


            if (
                totalWeight <=
                1e-9
            ) {

                return {

                    u:
                        0,

                    v:
                        0,

                    weight:
                        0,

                    speedMs:
                        0
                };
            }


            /*
             * Multiple arrows can reinforce one another but should not
             * create unlimited momentum.
             */

            const normalization =
                Math.max(
                    1,
                    totalWeight
                );


            const u =
                weightedU /
                normalization;


            const v =
                weightedV /
                normalization;


            let speed =
                Math.hypot(
                    u,
                    v
                );


            const maximum =
                C.limits.windMaxMs;


            let finalU =
                u;

            let finalV =
                v;


            if (
                speed >
                maximum
            ) {

                const scale =
                    maximum /
                    speed;


                finalU *=
                    scale;

                finalV *=
                    scale;

                speed =
                    maximum;
            }


            return {

                u:
                    finalU,

                v:
                    finalV,

                weight:
                    U.clamp(
                        totalWeight,
                        0,
                        2
                    ),

                speedMs:
                    speed
            };
        }


        /*
         * Alias for clarity inside the future physics module.
         */

        momentumForcingAt(
            latitude,
            longitude,
            levelIndex = 0
        ) {

            return this.steeringAt(
                latitude,
                longitude,
                levelIndex
            );
        }


        /* ============================================================
           TIME EVOLUTION
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


            if (
                hours <=
                0
            ) {
                return;
            }


            for (
                const system of this.systems
            ) {

                if (
                    !system.enabled
                ) {
                    continue;
                }


                system.move(
                    hours
                );
            }


            for (
                const arrow of this.arrows
            ) {

                arrow.ageHours +=
                    hours;
            }


            /*
             * Expired systems disappear only as forcing objects.
             *
             * Pressure already produced in the atmosphere remains in the
             * prognostic field and must dynamically evolve/fill.
             */

            this.systems =
                this.systems.filter(
                    system =>
                        !system.isExpired() &&
                        !system.isFarOutsideDomain()
                );


            this.arrows =
                this.arrows.filter(
                    arrow =>
                        !arrow.isExpired()
                );
        }


        /* ============================================================
           DEVELOPMENT HELPERS
        ============================================================ */

        createCycloneTest(
            options = {}
        ) {

            return this.addLow(

                finite(
                    options.lat,
                    54
                ),

                finite(
                    options.lon,
                    -8
                ),

                finite(
                    options.centralPressureHpa,
                    982
                ),

                {

                    name:
                        options.name ||
                        "V10 Cyclone Test",

                    radiusKm:
                        finite(
                            options.radiusKm,
                            950
                        ),

                    strength:
                        finite(
                            options.strength,
                            1
                        ),

                    bearingDeg:
                        finite(
                            options.bearingDeg,
                            75
                        ),

                    speedKmh:
                        finite(
                            options.speedKmh,
                            35
                        ),

                    developmentHours:
                        finite(
                            options.developmentHours,
                            12
                        ),

                    matureHours:
                        finite(
                            options.matureHours,
                            36
                        ),

                    fillingHours:
                        finite(
                            options.fillingHours,
                            48
                        )
                }
            );
        }


        /* ============================================================
           DIAGNOSTIC DESCRIPTION
        ============================================================ */

        describeSystem(
            systemOrId
        ) {

            const system =
                typeof systemOrId ===
                    "string"
                    ? this.getSystem(
                        systemOrId
                    )
                    : systemOrId;


            if (!system) {
                return null;
            }


            return {

                id:
                    system.id,

                name:
                    system.name,

                kind:
                    system.kind,

                latitude:
                    system.lat,

                longitude:
                    system.lon,

                centralPressureHpa:
                    system.centralPressureHpa,

                radiusKm:
                    system.radiusKm,

                strength:
                    system.strength,

                lifecycleStrength:
                    system.lifecycleFactor(),

                ageHours:
                    system.ageHours,

                lifetimeHours:
                    system.lifetimeHours,

                driftUMs:
                    system.movement.u,

                driftVMs:
                    system.movement.v,

                driftSpeedKmh:
                    Math.hypot(
                        system.movement.u,
                        system.movement.v
                    ) *
                    3.6,

                enabled:
                    system.enabled
            };
        }


        describeArrow(
            arrowOrId
        ) {

            const arrow =
                typeof arrowOrId ===
                    "string"
                    ? this.getArrow(
                        arrowOrId
                    )
                    : arrowOrId;


            if (!arrow) {
                return null;
            }


            return {

                id:
                    arrow.id,

                startLat:
                    arrow.startLat,

                startLon:
                    arrow.startLon,

                endLat:
                    arrow.endLat,

                endLon:
                    arrow.endLon,

                widthKm:
                    arrow.widthKm,

                speedKmh:
                    arrow.speedKmh,

                bearingDeg:
                    arrow.bearingDeg,

                strength:
                    arrow.strength,

                levelWeights:
                    arrow.levelWeights.slice(),

                enabled:
                    arrow.enabled,

                ageHours:
                    arrow.ageHours,

                lifetimeHours:
                    arrow.lifetimeHours
            };
        }


        listSystems() {

            return this.systems.map(
                system =>
                    this.describeSystem(
                        system
                    )
            );
        }


        listArrows() {

            return this.arrows.map(
                arrow =>
                    this.describeArrow(
                        arrow
                    )
            );
        }
    }


    /* ================================================================
       EXPORT
    ================================================================ */

    global.EuropaSynoptic =
        Object.freeze({

            Synoptic,

            PressureSystem,

            SteeringArrow,

            DEFAULT_BASE_PRESSURE_HPA
        });

})(window);
