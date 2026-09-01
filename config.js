/*
 * EuropaCraft Atmospheric Simulation
 * V10 Configuration
 *
 * Clean V10 architecture.
 * No backwards compatibility with V8 is intended.
 */

(function (global) {
    "use strict";


    const CONFIG = {

        version:
            "10.0.0",

        engineName:
            "EuropaCraft Atmosphere V10",


        /* ==========================================================
           DOMAIN
        ========================================================== */

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


        /* ==========================================================
           GRID AND TIME
        ========================================================== */

        grid: {

            nx:
                195,

            ny:
                110
        },


        time: {

            /*
             * Fundamental physical integration timestep.
             *
             * Accelerated playback MUST execute repeated four-minute
             * physics steps rather than increasing this number.
             */

            physicsStepMinutes:
                4,


            /*
             * Absolute protection against one browser frame attempting
             * effectively unlimited queued simulation work.
             */

            maxStepsPerFrame:
                150
        },


        /* ==========================================================
           NUMERICAL SAFETY LIMITS
        ========================================================== */

        limits: {

            temperatureMinC:
                -65,

            temperatureMaxC:
                55,


            pressureMinHpa:
                925,

            pressureMaxHpa:
                1070,


            windMaxMs:
                70,


            specificHumidityMaxKgKg:
                0.055,


            cloudWaterMaxKgKg:
                0.008,

            cloudIceMaxKgKg:
                0.006,


            precipitationMaxMmHr:
                100,


            verticalVelocityMaxMs:
                4.0
        },


        /* ==========================================================
           VERTICAL ATMOSPHERE
        ========================================================== */

        vertical: {

            /*
             * Four persistent atmospheric levels.
             *
             * Surface:
             * experienced weather and boundary layer.
             *
             * 925 hPa:
             * low-level air mass and convergence.
             *
             * 850 hPa:
             * principal frontal / air-mass level.
             *
             * 700 hPa:
             * lower-middle troposphere and cloud-depth information.
             */

            levels: [

                {

                    key:
                        "surface",

                    pressureHpa:
                        null,

                    approximateHeightM:
                        2
                },

                {

                    key:
                        "925",

                    pressureHpa:
                        925,

                    approximateHeightM:
                        750
                },

                {

                    key:
                        "850",

                    pressureHpa:
                        850,

                    approximateHeightM:
                        1500
                },

                {

                    key:
                        "700",

                    pressureHpa:
                        700,

                    approximateHeightM:
                        3000
                }
            ],


            environmentalLapseRateCPerKm:
                6.2,


            dryAdiabaticLapseRateCPerKm:
                9.8,


            moistAdiabaticLapseRateCPerKm:
                5.8,


            backgroundMixingPerHour:
                0.025,


            frontalMixingPerHour:
                0.08,


            convectiveMixingPerHour:
                0.18
        },


        /* ==========================================================
           ADVECTION
        ========================================================== */

        advection: {

            scheme:
                "semi-lagrangian",


            /*
             * Keep fronts and deliberately injected air masses coherent
             * for long enough to behave as recognisable weather systems.
             */

            temperatureDiffusionPerHour:
                0.004,


            moistureDiffusionPerHour:
                0.005,


            momentumDiffusionPerHour:
                0.008,


            cloudDiffusionPerHour:
                0.004,


            tracerDiffusionPerHour:
                0.0025,


            /*
             * Very weak relaxation along the outer domain boundary.
             */

            boundaryRelaxationPerHour:
                0.015
        },


        /* ==========================================================
           AIR-MASS SYSTEM
        ========================================================== */

        airMasses: {

            enabled:
                true,


            tracerTypes: [

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


            maxInjectedMasses:
                20,


            defaultRadiusKm:
                650,


            minimumRadiusKm:
                100,


            maximumRadiusKm:
                2200,


            defaultStrength:
                0.90,


            /*
             * FIXED IN THIS VERSION.
             *
             * This value is required by europacraft-airmasses.js.
             *
             * It is the minimum lifetime of the source RECORD, not the
             * lifetime of the injected air itself. Injected atmospheric
             * state persists through the atmosphere and its tracers.
             */

            minimumLifetimeHours:
                18,


            /*
             * Source identity should survive transport for days.
             */

            tracerDecayPerDay:
                0.018,


            environmentalModificationPerHour:
                0.012,


            minimumDominantTracer:
                0.08,


            collisionContrastThreshold:
                0.20
        },


        /* ==========================================================
           PRESSURE AND WIND
        ========================================================== */

        dynamics: {

            pressureGradientAcceleration:
                1.0,


            coriolisStrength:
                1.0,


            surfaceDragLand:
                0.11,


            surfaceDragSea:
                0.055,


            upperAirDrag:
                0.012,


            /*
             * Pressure is a prognostic atmospheric field.
             */

            pressureRelaxationPerHour:
                0.012,


            thermalPressureResponse:
                0.038,


            convergencePressureResponse:
                0.18,


            ascentPressureResponse:
                0.14,


            latentHeatingPressureResponse:
                0.045,


            divergencePressureResponse:
                0.10,


            maxPressureChangeHpaPerHour:
                3.5
        },


        /* ==========================================================
           FRONTOGENESIS
        ========================================================== */

        fronts: {

            temperatureGradientThresholdCPer100Km:
                1.0,


            humidityGradientThresholdPer100Km:
                0.03,


            tracerContrastThreshold:
                0.16,


            convergenceThreshold:
                0.018,


            frontogenesisPerHour:
                0.30,


            decayPerHour:
                0.035,


            temperatureGradientWeight:
                1.00,


            humidityGradientWeight:
                0.45,


            tracerContrastWeight:
                0.90,


            convergenceWeight:
                1.30,


            /*
             * Deliberately substantial frontal ascent.
             *
             * V10 should not allow a strong moist air-mass collision to
             * remain meteorologically inert.
             */

            frontalLiftMultiplier:
                2.8,


            coldFrontLiftMultiplier:
                1.45,


            warmFrontLiftMultiplier:
                1.15,


            occlusionLiftMultiplier:
                1.30,


            maximumFrontStrength:
                3.0
        },


        /* ==========================================================
           VERTICAL MOTION
        ========================================================== */

        verticalMotion: {

            convergenceMultiplier:
                3.0,


            frontalMultiplier:
                2.4,


            orographicMultiplier:
                1.8,


            convectiveMultiplier:
                1.4,


            pressureTendencyMultiplier:
                0.35,


            dampingPerHour:
                0.10,


            meaningfulAscentThreshold:
                0.04
        },


        /* ==========================================================
           TERRAIN
        ========================================================== */

        terrain: {

            mountainBlockingEnabled:
                true,


            blockingStartM:
                650,


            strongBlockingM:
                1200,


            blockingStrength:
                0.55,


            upslopeLiftStrength:
                1.70,


            saturatedUpslopeBoost:
                1.45,


            rainShadowStrength:
                0.42,


            surfaceLapseRateCPerKm:
                6.2
        },


        /* ==========================================================
           OCEAN
        ========================================================== */

        ocean: {

            minSstC:
                -2.0,


            maxSstC:
                32.0,


            seasonalRelaxationPerHour:
                0.0008,


            airSeaHeatExchangePerHour:
                0.035,


            windHeatExchangeBoost:
                0.055,


            evaporationBasePerHour:
                0.012,


            windEvaporationBoost:
                0.065,


            humidityDeficitBoost:
                1.0,


            /*
             * Makes cold maritime outbreaks capable of developing
             * convincing instability and shower activity.
             */

            coldAirInstabilityBoost:
                0.75
        },


        /* ==========================================================
           LAND SURFACE
        ========================================================== */

        ground: {

            temperatureMemory:
                0.985,


            airGroundExchangePerHour:
                0.060,


            moistureMemory:
                0.995,


            rainWettingPerMm:
                0.04,


            dryingPerHour:
                0.005,


            snowInsulationStrength:
                0.45
        },


        /* ==========================================================
           RADIATION
        ========================================================== */

        radiation: {

            landSolarHeating:
                0.085,


            oceanSolarHeating:
                0.012,


            clearNightCooling:
                0.065,


            cloudShortwaveSuppression:
                0.72,


            lowCloudLongwaveRetention:
                0.75,


            highCloudLongwaveRetention:
                0.50,


            snowAlbedoCooling:
                0.60
        },


        /* ==========================================================
           SATURATION AND CLOUD FORMATION
        ========================================================== */

        moisture: {

            saturationRH:
                1.0,


            nearSaturationRH:
                0.90,


            cloudFormationRH:
                0.92,


            condensationEfficiency:
                0.82,


            forcedLiftCondensationEfficiency:
                0.40,


            evaporationEfficiency:
                0.20,


            sublimationEfficiency:
                0.10,


            latentHeatStrength:
                1.0
        },


        /* ==========================================================
           CLOUD MICROPHYSICS
        ========================================================== */

        cloud: {

            liquidAutoconversionKgKg:
                0.00012,


            iceAutoconversionKgKg:
                0.00009,


            liquidAutoconversionRate:
                0.30,


            iceAutoconversionRate:
                0.25,


            accretionRate:
                0.20,


            frontalPersistence:
                0.97,


            stratiformPersistence:
                0.94,


            convectivePersistence:
                0.82
        },


        /* ==========================================================
           PRECIPITATION
        ========================================================== */

        precipitation: {

            frontalEfficiency:
                1.25,


            orographicEfficiency:
                1.15,


            convectiveEfficiency:
                1.10,


            belowCloudEvaporation:
                0.18,


            maximumMmHr:
                100,


            drizzleMmHr:
                0.05,


            lightMmHr:
                0.5,


            moderateMmHr:
                2.5,


            heavyMmHr:
                7.5,


            extremeMmHr:
                25,


            /*
             * This is not spontaneous/artificial rain.
             *
             * It only acts where:
             *
             *   - strong ascent exists
             *   - near saturation exists
             *   - actual cloud condensate exists
             *   - numerical precipitation production has nevertheless
             *     remained implausibly close to zero
             */

            sanityFloor: {

                enabled:
                    true,


                minimumRH:
                    0.965,


                minimumVerticalMotion:
                    0.12,


                minimumCondensateKgKg:
                    0.00008,


                minimumRateMmHr:
                    0.08
            }
        },


        /* ==========================================================
           PRECIPITATION PHASE
        ========================================================== */

        precipitationPhase: {

            /*
             * The V10 microphysics engine uses wet-bulb temperatures and
             * vertical thermal structure instead of a single fixed
             * surface-temperature snow boundary.
             */

            definiteSnowWetBulbC:
                0.4,


            wetSnowUpperWetBulbC:
                1.2,


            mixedUpperWetBulbC:
                2.2,


            definiteRainWetBulbC:
                3.0,


            warmNoseMinimumC:
                0.5,


            strongWarmNoseC:
                2.0,


            refreezeLayerC:
                -1.0,


            evaporativeCoolingStrength:
                0.70,


            dynamicCoolingStrength:
                0.60,


            precipitationCoolingStrength:
                0.45
        },


        /* ==========================================================
           CONVECTION
        ========================================================== */

        convection: {

            enabled:
                true,


            minimumInstabilityC:
                2.5,


            strongInstabilityC:
                7.0,


            minimumRH:
                0.72,


            minimumTriggerLift:
                0.10,


            oceanColdAirBoost:
                0.85,


            maximumLiftBoost:
                2.2
        },


        /* ==========================================================
           SNOW
        ========================================================== */

        snow: {

            minimumAccumulatingRateMmHr:
                0.10,


            wetSnowRatioCmPerMm:
                0.55,


            normalSnowRatioCmPerMm:
                1.0,


            drySnowRatioCmPerMm:
                1.45,


            settlingPerHour:
                0.008,


            airTemperatureMeltPerHour:
                0.035,


            rainMeltPerMm:
                0.018,


            solarMeltPerHour:
                0.025
        },


        /* ==========================================================
           HISTORY AND STATIONS
        ========================================================== */

        history: {

            snapshotEveryMinutes:
                60,


            /*
             * This remains the theoretical history window.
             *
             * europacraft-history.js also enforces a browser memory budget
             * for full rewind snapshots.
             */

            maxSnapshots:
                24 *
                35,


            stationSampleEveryMinutes:
                4,


            maxStationSamples:
                24 *
                15 *
                90
        },


        /* ==========================================================
           DEVELOPMENT CONTROLS
        ========================================================== */

        forcing: {

            maxSteeringArrows:
                10,


            arrowDefaultWidthKm:
                800,


            arrowDefaultSpeedKmh:
                45,


            arrowDefaultStrength:
                0.65,


            arrowMaximumSpeedKmh:
                160,


            airMassDefaultRadiusKm:
                650,


            airMassDefaultStrength:
                0.90
        },


        /* ==========================================================
           DIAGNOSTICS
        ========================================================== */

        diagnostics: {

            enabled:
                true,


            storeRH:
                true,


            storeWetBulb:
                true,


            storeConvergence:
                true,


            storeTemperatureGradient:
                true,


            storeTracerContrast:
                true,


            storeFrontStrength:
                true,


            storeVerticalVelocity:
                true,


            storeOrographicLift:
                true,


            storeConvectiveLift:
                true,


            storeCondensation:
                true,


            storeCloudLiquid:
                true,


            storeCloudIce:
                true,


            storePrecipProduction:
                true,


            storePrecipEvaporation:
                true,


            storeSaturationDeficit:
                true,


            storeDominantAirMass:
                true,


            storePrecipitationReason:
                true
        },


        /* ==========================================================
           ACCEPTANCE TARGET
        ========================================================== */

        acceptance: {

            /*
             * Development target:
             *
             * create two contrasting air masses,
             * move them together,
             * and at accelerated playback observe recognisable evolving
             * consequences within a practical real-time test.
             */

            collisionTestTargetRealSeconds:
                10,


            requirePersistentAirMasses:
                true,


            requireDynamicPressure:
                true,


            requireFrontogenesis:
                true,


            requireVerticalAtmosphere:
                true,


            requirePhysicalCloudFormation:
                true,


            requirePhysicalPrecipitation:
                true
        }
    };


    /* ================================================================
       DEEP FREEZE
    ================================================================ */

    function deepFreeze(
        value
    ) {

        if (
            value ===
                null ||
            typeof value !==
                "object" ||
            Object.isFrozen(
                value
            )
        ) {

            return value;
        }


        Object.freeze(
            value
        );


        for (
            const child of Object.values(
                value
            )
        ) {

            deepFreeze(
                child
            );
        }


        return value;
    }


    /* ================================================================
       EXPORT
    ================================================================ */

    global.EuropaConfig =
        deepFreeze(
            CONFIG
        );

})(window);
