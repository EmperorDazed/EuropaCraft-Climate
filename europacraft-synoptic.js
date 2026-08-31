/* ============================================================================
   EuropaCraft Weather Simulator
   Synoptic Pressure Systems and Steering Flow
   Version 7.1

   NEW FILE

   PURPOSE

   This file controls broad-scale atmospheric circulation:

       - low pressure systems
       - high pressure systems
       - movement of pressure systems
       - cyclone lifecycle
       - broad rotational wind structure
       - pressure tendency
       - steering arrows

   IMPORTANT DESIGN RULE

   Synoptic systems do NOT directly paint temperature anomalies.

   They influence:

       pressure
       wind
       convergence
       transport

   The atmosphere then moves and modifies actual air.

   User steering arrows also modify FLOW, not temperature.

============================================================================ */

(function (global) {
"use strict";


const U = global.EuropaUtils;
const C = global.EuropaConfig;


/* ============================================================================
   DEFAULT SYNOPTIC SETTINGS

   These are kept here only for structural defaults.

   Most values that the user is likely to tune regularly should eventually
   be moved into europacraft-config.js if needed.
============================================================================ */

const SYNOPTIC_DEFAULTS = {

    backgroundPressureHpa: 1015,

    minimumSystemRadiusKm: 350,

    maximumSystemRadiusKm: 1800,

    defaultLowRadiusKm: 850,

    defaultHighRadiusKm: 1100,

    lowSpawnWestLon: -32,

    lowSpawnEastLon: 12,

    lowSpawnSouthLat: 45,

    lowSpawnNorthLat: 68,

    highSpawnWestLon: -15,

    highSpawnEastLon: 38,

    highSpawnSouthLat: 34,

    highSpawnNorthLat: 65,

    lowLifetimeHoursMin: 72,

    lowLifetimeHoursMax: 180,

    highLifetimeHoursMin: 96,

    highLifetimeHoursMax: 260,

    lowPressureMin: 970,

    lowPressureMax: 1005,

    highPressureMin: 1020,

    highPressureMax: 1045,

    systemMovementNoiseMs: 2.2,

    cyclonicRotationStrength: 0.75,

    anticyclonicRotationStrength: 0.52,

    pressureWindScale: 920,

    systemInteractionStrength: 0.12,

    pressureRelaxation: 0.035
};


/* ============================================================================
   HELPERS
============================================================================ */

function randomRange(
    random,
    min,
    max
) {

    return (
        min +
        random() *
        (
            max -
            min
        )
    );
}


function signedSystemStrength(
    pressureHpa,
    backgroundHpa
) {

    return (
        backgroundHpa -
        pressureHpa
    );
}


function systemIsLow(
    system
) {

    return (
        system.pressureHpa <
        SYNOPTIC_DEFAULTS.backgroundPressureHpa
    );
}


/* ============================================================================
   SYNOPTIC SYSTEM CLASS
============================================================================ */

class SynopticSystem {

    constructor(
        options = {}
    ) {

        this.id = (
            options.id ||
            (
                "SYS-" +
                Date.now().toString(36) +
                "-" +
                Math.floor(
                    Math.random() *
                    99999
                ).toString(36)
            )
        );


        this.type = (
            options.type ||
            "low"
        );


        this.lat = Number(
            options.lat
        );


        this.lon = Number(
            options.lon
        );


        this.pressureHpa = Number(
            options.pressureHpa
        );


        this.radiusKm = Number(
            options.radiusKm
        );


        this.lifeHours = Number(
            options.lifeHours
        );


        this.ageHours = Number(
            options.ageHours || 0
        );


        this.driftUms = Number(
            options.driftUms || 0
        );


        this.driftVms = Number(
            options.driftVms || 0
        );


        this.deepeningRateHpaPerHour = Number(
            options.deepeningRateHpaPerHour || 0
        );


        this.fillingRateHpaPerHour = Number(
            options.fillingRateHpaPerHour || 0
        );


        this.maturity = Number(
            options.maturity || 0
        );


        this.active = (
            options.active !== false
        );


        this.rotationStrength = Number(
            options.rotationStrength !== undefined
                ? options.rotationStrength
                : (
                    this.type === "low"
                        ? SYNOPTIC_DEFAULTS.cyclonicRotationStrength
                        : SYNOPTIC_DEFAULTS.anticyclonicRotationStrength
                )
        );
    }


    get strengthHpa() {

        return signedSystemStrength(
            this.pressureHpa,
            SYNOPTIC_DEFAULTS.backgroundPressureHpa
        );
    }


    get isLow() {

        return (
            this.type === "low"
        );
    }


    get isHigh() {

        return (
            this.type === "high"
        );
    }


    get lifeFraction() {

        return U.clamp(
            this.ageHours /
            Math.max(
                1,
                this.lifeHours
            ),
            0,
            1
        );
    }
}


/* ============================================================================
   SYNOPTIC CONTROLLER
============================================================================ */

class Synoptic {

    constructor(
        terrain,
        seed = 20261001
    ) {

        this.terrain = terrain;

        this.random = U.seededRandom(
            seed
        );


        this.systems = [];


        this.arrows = [];


        this._nextSystemId = 1;


        this._initializeDefaultSystems();
    }


    /* ========================================================================
       INITIAL SYNOPTIC PATTERN
       ======================================================================== */

    _initializeDefaultSystems() {

        /*
         * North Atlantic low
         */

        this.systems.push(
            new SynopticSystem({

                id: "ATL-LOW-1",

                type: "low",

                lat: 58,

                lon: -18,

                pressureHpa: 988,

                radiusKm: 1050,

                lifeHours: 128,

                driftUms: 9.0,

                driftVms: 1.0,

                deepeningRateHpaPerHour: -0.08,

                fillingRateHpaPerHour: 0.12
            })
        );


        /*
         * Azores / southwest European high
         */

        this.systems.push(
            new SynopticSystem({

                id: "AZORES-HIGH-1",

                type: "high",

                lat: 39,

                lon: -8,

                pressureHpa: 1027,

                radiusKm: 1450,

                lifeHours: 220,

                driftUms: 2.5,

                driftVms: 0.4,

                deepeningRateHpaPerHour: 0,

                fillingRateHpaPerHour: 0
            })
        );


        /*
         * Eastern European high
         */

        this.systems.push(
            new SynopticSystem({

                id: "EAST-HIGH-1",

                type: "high",

                lat: 55,

                lon: 30,

                pressureHpa: 1023,

                radiusKm: 1050,

                lifeHours: 150,

                driftUms: 2.5,

                driftVms: -0.4
            })
        );
    }


    /* ========================================================================
       SYSTEM CREATION
       ======================================================================== */

    createLow(
        options = {}
    ) {

        const low = new SynopticSystem({

            id:
                "LOW-" +
                (
                    this._nextSystemId++
                ),

            type:
                "low",

            lat:
                options.lat !== undefined
                    ? options.lat
                    : randomRange(
                        this.random,
                        SYNOPTIC_DEFAULTS.lowSpawnSouthLat,
                        SYNOPTIC_DEFAULTS.lowSpawnNorthLat
                    ),

            lon:
                options.lon !== undefined
                    ? options.lon
                    : randomRange(
                        this.random,
                        SYNOPTIC_DEFAULTS.lowSpawnWestLon,
                        SYNOPTIC_DEFAULTS.lowSpawnEastLon
                    ),

            pressureHpa:
                options.pressureHpa !== undefined
                    ? options.pressureHpa
                    : randomRange(
                        this.random,
                        SYNOPTIC_DEFAULTS.lowPressureMin,
                        SYNOPTIC_DEFAULTS.lowPressureMax
                    ),

            radiusKm:
                options.radiusKm !== undefined
                    ? options.radiusKm
                    : randomRange(
                        this.random,
                        650,
                        1250
                    ),

            lifeHours:
                options.lifeHours !== undefined
                    ? options.lifeHours
                    : randomRange(
                        this.random,
                        SYNOPTIC_DEFAULTS.lowLifetimeHoursMin,
                        SYNOPTIC_DEFAULTS.lowLifetimeHoursMax
                    ),

            driftUms:
                options.driftUms !== undefined
                    ? options.driftUms
                    : randomRange(
                        this.random,
                        5,
                        15
                    ),

            driftVms:
                options.driftVms !== undefined
                    ? options.driftVms
                    : randomRange(
                        this.random,
                        -2,
                        3
                    ),

            deepeningRateHpaPerHour:
                options.deepeningRateHpaPerHour !== undefined
                    ? options.deepeningRateHpaPerHour
                    : randomRange(
                        this.random,
                        -0.18,
                        -0.02
                    ),

            fillingRateHpaPerHour:
                options.fillingRateHpaPerHour !== undefined
                    ? options.fillingRateHpaPerHour
                    : randomRange(
                        this.random,
                        0.05,
                        0.18
                    )
        });


        this.systems.push(
            low
        );


        return low;
    }


    createHigh(
        options = {}
    ) {

        const high = new SynopticSystem({

            id:
                "HIGH-" +
                (
                    this._nextSystemId++
                ),

            type:
                "high",

            lat:
                options.lat !== undefined
                    ? options.lat
                    : randomRange(
                        this.random,
                        SYNOPTIC_DEFAULTS.highSpawnSouthLat,
                        SYNOPTIC_DEFAULTS.highSpawnNorthLat
                    ),

            lon:
                options.lon !== undefined
                    ? options.lon
                    : randomRange(
                        this.random,
                        SYNOPTIC_DEFAULTS.highSpawnWestLon,
                        SYNOPTIC_DEFAULTS.highSpawnEastLon
                    ),

            pressureHpa:
                options.pressureHpa !== undefined
                    ? options.pressureHpa
                    : randomRange(
                        this.random,
                        SYNOPTIC_DEFAULTS.highPressureMin,
                        SYNOPTIC_DEFAULTS.highPressureMax
                    ),

            radiusKm:
                options.radiusKm !== undefined
                    ? options.radiusKm
                    : randomRange(
                        this.random,
                        850,
                        1600
                    ),

            lifeHours:
                options.lifeHours !== undefined
                    ? options.lifeHours
                    : randomRange(
                        this.random,
                        SYNOPTIC_DEFAULTS.highLifetimeHoursMin,
                        SYNOPTIC_DEFAULTS.highLifetimeHoursMax
                    ),

            driftUms:
                options.driftUms !== undefined
                    ? options.driftUms
                    : randomRange(
                        this.random,
                        0,
                        6
                    ),

            driftVms:
                options.driftVms !== undefined
                    ? options.driftVms
                    : randomRange(
                        this.random,
                        -1.5,
                        1.5
                    )
        });


        this.systems.push(
            high
        );


        return high;
    }


    /* ========================================================================
       SYSTEM LIFECYCLE
       ======================================================================== */

    advanceSystems(
        dtHours
    ) {

        for (
            const system
            of this.systems
        ) {

            if (
                !system.active
            ) {

                continue;
            }


            system.ageHours += dtHours;


            const lifeFraction = (
                system.lifeFraction
            );


            /*
             * Cyclone lifecycle:
             *
             * 0.0 - 0.35:
             *     deepening / development
             *
             * 0.35 - 0.70:
             *     mature
             *
             * 0.70 - 1.0:
             *     filling / weakening
             */

            if (
                system.isLow
            ) {

                if (
                    lifeFraction <
                    0.35
                ) {

                    system.pressureHpa += (
                        system.deepeningRateHpaPerHour *
                        dtHours
                    );
                }

                else if (
                    lifeFraction >
                    0.70
                ) {

                    system.pressureHpa += (
                        system.fillingRateHpaPerHour *
                        dtHours
                    );
                }
            }


            if (
                system.isHigh
            ) {

                /*
                 * High pressure varies much more slowly.
                 */

                if (
                    lifeFraction >
                    0.75
                ) {

                    system.pressureHpa -= (
                        0.025 *
                        dtHours
                    );
                }
            }


            system.pressureHpa = U.clamp(

                system.pressureHpa,

                C.grid.minPressureHpa,

                C.grid.maxPressureHpa
            );


            /* ================================================================
               SYSTEM MOVEMENT
               ================================================================ */

            let u = (
                system.driftUms
            );


            let v = (
                system.driftVms
            );


            /*
             * Small deterministic wandering.
             *
             * This modifies trajectory without visually random pressure noise.
             */

            u += (
                this.random() -
                0.5
            ) *
            SYNOPTIC_DEFAULTS.systemMovementNoiseMs;


            v += (
                this.random() -
                0.5
            ) *
            SYNOPTIC_DEFAULTS.systemMovementNoiseMs;


            const latRadians = (
                system.lat *
                U.DEG
            );


            const deltaLat = (
                (
                    v *
                    dtHours *
                    3.6
                ) /
                U.kmPerDegreeLatitude()
            );


            const deltaLon = (
                (
                    u *
                    dtHours *
                    3.6
                ) /
                U.kmPerDegreeLongitude(
                    system.lat
                )
            );


            system.lat += (
                deltaLat
            );


            system.lon += (
                deltaLon
            );


            /*
             * Allow Atlantic systems to originate west of the playable map,
             * but recycle once they are far beyond eastern Europe.
             */

            if (
                system.lon >
                C.bounds.east +
                18
            ) {

                if (
                    system.isLow
                ) {

                    this._recycleLow(
                        system
                    );
                }

                else {

                    this._recycleHigh(
                        system
                    );
                }
            }


            if (
                system.ageHours >=
                system.lifeHours
            ) {

                if (
                    system.isLow
                ) {

                    this._recycleLow(
                        system
                    );
                }

                else {

                    this._recycleHigh(
                        system
                    );
                }
            }
        }


        this._systemInteractions(
            dtHours
        );
    }


    /* ========================================================================
       RECYCLE SYSTEMS
       ======================================================================== */

    _recycleLow(
        system
    ) {

        system.lat = randomRange(
            this.random,
            SYNOPTIC_DEFAULTS.lowSpawnSouthLat,
            SYNOPTIC_DEFAULTS.lowSpawnNorthLat
        );


        system.lon = randomRange(
            this.random,
            SYNOPTIC_DEFAULTS.lowSpawnWestLon,
            -12
        );


        system.pressureHpa = randomRange(
            this.random,
            SYNOPTIC_DEFAULTS.lowPressureMin,
            SYNOPTIC_DEFAULTS.lowPressureMax
        );


        system.radiusKm = randomRange(
            this.random,
            650,
            1300
        );


        system.ageHours = 0;


        system.lifeHours = randomRange(
            this.random,
            SYNOPTIC_DEFAULTS.lowLifetimeHoursMin,
            SYNOPTIC_DEFAULTS.lowLifetimeHoursMax
        );


        system.driftUms = randomRange(
            this.random,
            6,
            15
        );


        system.driftVms = randomRange(
            this.random,
            -2,
            3
        );


        system.deepeningRateHpaPerHour = randomRange(
            this.random,
            -0.18,
            -0.03
        );


        system.fillingRateHpaPerHour = randomRange(
            this.random,
            0.05,
            0.18
        );
    }


    _recycleHigh(
        system
    ) {

        system.lat = randomRange(
            this.random,
            SYNOPTIC_DEFAULTS.highSpawnSouthLat,
            SYNOPTIC_DEFAULTS.highSpawnNorthLat
        );


        system.lon = randomRange(
            this.random,
            SYNOPTIC_DEFAULTS.highSpawnWestLon,
            SYNOPTIC_DEFAULTS.highSpawnEastLon
        );


        system.pressureHpa = randomRange(
            this.random,
            SYNOPTIC_DEFAULTS.highPressureMin,
            SYNOPTIC_DEFAULTS.highPressureMax
        );


        system.radiusKm = randomRange(
            this.random,
            850,
            1600
        );


        system.ageHours = 0;


        system.lifeHours = randomRange(
            this.random,
            SYNOPTIC_DEFAULTS.highLifetimeHoursMin,
            SYNOPTIC_DEFAULTS.highLifetimeHoursMax
        );


        system.driftUms = randomRange(
            this.random,
            0,
            6
        );


        system.driftVms = randomRange(
            this.random,
            -1.5,
            1.5
        );
    }


    /* ========================================================================
       SYSTEM INTERACTION

       Nearby lows and highs influence one another slightly.

       This is deliberately weak.

       It prevents completely independent pressure blobs without trying to
       become a full primitive-equation atmosphere.
       ======================================================================== */

    _systemInteractions(
        dtHours
    ) {

        for (
            let i = 0;
            i < this.systems.length;
            i++
        ) {

            const a = (
                this.systems[i]
            );


            if (
                !a.active
            ) {

                continue;
            }


            for (
                let j = i + 1;
                j < this.systems.length;
                j++
            ) {

                const b = (
                    this.systems[j]
                );


                if (
                    !b.active
                ) {

                    continue;
                }


                const distance = U.haversineKm(
                    a.lat,
                    a.lon,
                    b.lat,
                    b.lon
                );


                const interactionRadius = (
                    (
                        a.radiusKm +
                        b.radiusKm
                    ) *
                    0.65
                );


                if (
                    distance >
                    interactionRadius
                ) {

                    continue;
                }


                const influence = (
                    1 -
                    distance /
                    Math.max(
                        1,
                        interactionRadius
                    )
                );


                const bearingAB = U.bearingDeg(
                    a.lat,
                    a.lon,
                    b.lat,
                    b.lon
                );


                const vector = U.vectorFromBearingSpeed(
                    bearingAB,
                    influence *
                    SYNOPTIC_DEFAULTS.systemInteractionStrength
                );


                if (
                    a.type ===
                    b.type
                ) {

                    /*
                     * Similar systems weakly repel.
                     */

                    a.driftUms -= (
                        vector.u *
                        dtHours
                    );

                    a.driftVms -= (
                        vector.v *
                        dtHours
                    );


                    b.driftUms += (
                        vector.u *
                        dtHours
                    );

                    b.driftVms += (
                        vector.v *
                        dtHours
                    );
                }

                else {

                    /*
                     * Opposite systems weakly orbit / interact.
                     */

                    a.driftUms += (
                        vector.v *
                        0.45 *
                        dtHours
                    );

                    a.driftVms -= (
                        vector.u *
                        0.45 *
                        dtHours
                    );


                    b.driftUms -= (
                        vector.v *
                        0.45 *
                        dtHours
                    );

                    b.driftVms += (
                        vector.u *
                        0.45 *
                        dtHours
                    );
                }
            }
        }
    }


    /* ========================================================================
       PRESSURE CONTRIBUTION FROM ONE SYSTEM
       ======================================================================== */

    systemPressureContribution(
        system,
        lat,
        lon
    ) {

        const distance = U.haversineKm(
            lat,
            lon,
            system.lat,
            system.lon
        );


        const radius = Math.max(
            SYNOPTIC_DEFAULTS.minimumSystemRadiusKm,
            system.radiusKm
        );


        const gaussian = U.gaussian(
            distance,
            radius * 0.55
        );


        const difference = (
            system.pressureHpa -
            SYNOPTIC_DEFAULTS.backgroundPressureHpa
        );


        return (
            difference *
            gaussian
        );
    }


    /* ========================================================================
       PRESSURE FIELD
       ======================================================================== */

    pressureField(
        backgroundPressure =
            SYNOPTIC_DEFAULTS.backgroundPressureHpa
    ) {

        const n = (
            this.terrain.n
        );


        const output = (
            new Float32Array(
                n
            )
        );


        for (
            let i = 0;
            i < n;
            i++
        ) {

            const lat = (
                this.terrain.lat[i]
            );


            const lon = (
                this.terrain.lon[i]
            );


            let pressure = (
                backgroundPressure
            );


            for (
                const system
                of this.systems
            ) {

                if (
                    !system.active
                ) {

                    continue;
                }


                pressure += (
                    this.systemPressureContribution(
                        system,
                        lat,
                        lon
                    )
                );
            }


            output[i] = U.clamp(
                pressure,
                C.grid.minPressureHpa,
                C.grid.maxPressureHpa
            );
        }


        return output;
    }


    /* ========================================================================
       SYSTEM ROTATIONAL WIND

       Northern Hemisphere:

           low:
               counter-clockwise

           high:
               clockwise

       This supplements pressure-gradient wind.

       It is NOT the only wind component.
       ======================================================================== */

    rotationalWindAt(
        lat,
        lon
    ) {

        let totalU = 0;

        let totalV = 0;


        for (
            const system
            of this.systems
        ) {

            if (
                !system.active
            ) {

                continue;
            }


            const distance = U.haversineKm(
                lat,
                lon,
                system.lat,
                system.lon
            );


            const radius = Math.max(
                1,
                system.radiusKm
            );


            if (
                distance >
                radius *
                2.4
            ) {

                continue;
            }


            const radialInfluence = (
                (
                    distance /
                    radius
                ) *
                Math.exp(
                    1 -
                    distance /
                    radius
                )
            );


            const pressureDifference = Math.abs(
                SYNOPTIC_DEFAULTS.backgroundPressureHpa -
                system.pressureHpa
            );


            let speed = (
                pressureDifference *
                0.52 *
                radialInfluence *
                system.rotationStrength
            );


            speed = U.clamp(
                speed,
                0,
                34
            );


            const radialBearing = U.bearingDeg(
                system.lat,
                system.lon,
                lat,
                lon
            );


            let windBearing;


            if (
                system.isLow
            ) {

                /*
                 * Counter-clockwise plus slight inward component.
                 */

                windBearing = (
                    radialBearing -
                    78
                );
            }

            else {

                /*
                 * Clockwise plus slight outward component.
                 */

                windBearing = (
                    radialBearing +
                    78
                );
            }


            const vector = U.vectorFromBearingSpeed(
                windBearing,
                speed
            );


            totalU += vector.u;

            totalV += vector.v;
        }


        return {

            u: totalU,

            v: totalV
        };
    }


    /* ========================================================================
       USER STEERING ARROWS
       ======================================================================== */

    addArrow(
        sourceLat,
        sourceLon,
        targetLat,
        targetLon,
        options = {}
    ) {

        if (
            this.arrows.length >=
            C.forcing.maxArrows
        ) {

            this.arrows.shift();
        }


        const arrow = {

            id:
                "ARROW-" +
                Date.now().toString(36) +
                "-" +
                Math.floor(
                    this.random() *
                    9999
                ),

            sourceLat,

            sourceLon,

            targetLat,

            targetLon,


            widthKm: U.clamp(
                Number(
                    options.widthKm
                ) ||
                C.forcing.defaultWidthKm,

                100,

                2500
            ),


            speedKmh: U.clamp(
                Number(
                    options.speedKmh
                ) ||
                C.forcing.defaultSpeedKmh,

                1,

                C.forcing.maxSpeedKmh
            ),


            strength: U.clamp(
                Number(
                    options.strength
                ) ||
                C.forcing.defaultStrength,

                0.05,

                1
            ),


            enabled:
                options.enabled !== false
        };


        this.arrows.push(
            arrow
        );


        return arrow;
    }


    removeArrow(
        id
    ) {

        this.arrows = (
            this.arrows.filter(
                arrow =>
                    arrow.id !== id
            )
        );
    }


    clearArrows() {

        this.arrows.length = 0;
    }


    /* ========================================================================
       FORCING AT LOCATION

       Multiple arrows combine.

       They do not overwrite one another.
       ======================================================================== */

    forcingAt(
        lat,
        lon
    ) {

        let u = 0;

        let v = 0;

        let totalInfluence = 0;


        for (
            const arrow
            of this.arrows
        ) {

            if (
                !arrow.enabled
            ) {

                continue;
            }


            const distance = U.pointSegmentDistanceKm(
                lat,
                lon,

                arrow.sourceLat,
                arrow.sourceLon,

                arrow.targetLat,
                arrow.targetLon
            );


            const sigma = (
                arrow.widthKm *
                0.42
            );


            const corridorInfluence = (
                U.gaussian(
                    distance,
                    sigma
                ) *
                arrow.strength
            );


            if (
                corridorInfluence <
                0.001
            ) {

                continue;
            }


            const bearing = U.bearingDeg(
                arrow.sourceLat,
                arrow.sourceLon,
                arrow.targetLat,
                arrow.targetLon
            );


            const targetSpeedMs = (
                arrow.speedKmh /
                3.6
            );


            const vector = U.vectorFromBearingSpeed(
                bearing,
                targetSpeedMs
            );


            u += (
                vector.u *
                corridorInfluence
            );


            v += (
                vector.v *
                corridorInfluence
            );


            totalInfluence += (
                corridorInfluence
            );
        }


        return {

            u,

            v,

            influence:
                U.clamp(
                    totalInfluence,
                    0,
                    3
                )
        };
    }


    /* ========================================================================
       COMBINED SYNOPTIC WIND GUIDANCE
       ======================================================================== */

    guidanceWindAt(
        lat,
        lon
    ) {

        const rotational = (
            this.rotationalWindAt(
                lat,
                lon
            )
        );


        const forcing = (
            this.forcingAt(
                lat,
                lon
            )
        );


        return {

            u:
                rotational.u +
                forcing.u,

            v:
                rotational.v +
                forcing.v,

            forcingInfluence:
                forcing.influence
        };
    }


    /* ========================================================================
       PUBLIC SYSTEM INFO
       ======================================================================== */

    getSystems() {

        return this.systems.map(
            system => ({

                id:
                    system.id,

                type:
                    system.type,

                lat:
                    system.lat,

                lon:
                    system.lon,

                pressureHpa:
                    system.pressureHpa,

                radiusKm:
                    system.radiusKm,

                ageHours:
                    system.ageHours,

                lifeHours:
                    system.lifeHours,

                lifeFraction:
                    system.lifeFraction,

                active:
                    system.active
            })
        );
    }
}


/* ============================================================================
   EXPORT
============================================================================ */

global.EuropaSynoptic = Synoptic;

global.EuropaSynopticSystem = SynopticSystem;

global.EuropaSynopticDefaults = SYNOPTIC_DEFAULTS;

})(window);
