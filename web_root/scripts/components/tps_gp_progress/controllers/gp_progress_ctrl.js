'use strict';
define(function(require) {
    var module = require('components/tps_gp_progress/module');

    module.controller('gpProgressCtrl', ['$scope', '$http', function($scope, $http) {

        $scope.loading = true;
        $scope.error = null;
        $scope.gradPlans = [];
        $scope.expandedPlans = {};

        var studentId = document.getElementById('tps-curstudid').value;

        function processNode(node, creditMap) {
            var gd = node.groupDetail || {};
            var earned = gd.creditsEarned || 0;
            var enrolled = gd.creditsEnrolled || 0;
            var capacity = gd.effectiveCreditCapacity || 0;
            var processedChildren = (node.children || []).map(function(c) {
                return processNode(c, creditMap);
            });

            var statusText = '';
            if (node.type === 3) {
                var passedIds = (gd.passedScoreIds || '').split(',').filter(Boolean);
                var totalIds  = (gd.testScoreIds   || '').split(',').filter(Boolean);
                statusText = passedIds.length + ' of ' + totalIds.length + ' Required Tests Taken';
            } else if (processedChildren.length > 0 && node.type === 2) {
                var completed = processedChildren.filter(function(c) {
                    var cgd = c.groupDetail || {};
                    return (cgd.creditsEarned || 0) >= (cgd.effectiveCreditCapacity || 1);
                }).length;
                statusText = completed + ' of ' + processedChildren.length + ' Requirements';
            } else {
                statusText = earned + ' of ' + capacity + ' Credits';
            }

            var progressPct = capacity > 0 ? Math.min(100, earned / capacity * 100) : 0;
            var enrolledPct = capacity > 0 ? Math.min(100 - progressPct, enrolled / capacity * 100) : 0;

            var earnedIds   = (gd.earnedCreditSourceIds   || '').split(',').filter(Boolean).map(Number);
            var enrolledIds = (gd.enrolledCreditSourceIds || '').split(',').filter(Boolean).map(Number);
            var earnedCredits   = earnedIds.map(function(id) { return creditMap[id]; }).filter(Boolean);
            var enrolledCredits = enrolledIds.map(function(id) { return creditMap[id]; }).filter(Boolean);

            return {
                id: node.id,
                name: node.name,
                type: node.type,
                groupDetail: node.groupDetail,
                children: processedChildren,
                statusText: statusText,
                progressPct: progressPct,
                enrolledPct: enrolledPct,
                earnedCredits: earnedCredits,
                enrolledCredits: enrolledCredits,
                _expanded: false
            };
        }

        function processGradPlan(plan) {
            var creditMap = {};
            (plan.creditDetails || []).forEach(function(c) {
                creditMap[c.sourceId] = c;
            });

            var processedChildren = (plan.root && plan.root.children || []).map(function(node) {
                return processNode(node, creditMap);
            });

            var totalEarned = 0, totalEnrolled = 0, totalCapacity = 0;
            processedChildren.forEach(function(node) {
                if (node.type !== 3 && node.groupDetail) {
                    totalEarned   += node.groupDetail.creditsEarned   || 0;
                    totalEnrolled += node.groupDetail.creditsEnrolled || 0;
                    totalCapacity += node.groupDetail.effectiveCreditCapacity || 0;
                }
            });

            var testNodes = processedChildren.filter(function(n) { return n.type === 3; });
            var totalTests = testNodes.length;
            var testsPassed = testNodes.filter(function(n) {
                return n.groupDetail && (n.groupDetail.passedScoreIds || '').split(',').filter(Boolean).length > 0;
            }).length;

            var overallPct  = totalCapacity > 0 ? Math.min(100, totalEarned / totalCapacity * 100) : 0;
            var enrolledPct = totalCapacity > 0 ? Math.min(100 - overallPct, totalEnrolled / totalCapacity * 100) : 0;

            return {
                gradPlan: plan.gradPlan,
                gradPlanVersion: plan.gradPlanVersion,
                gpaNode: plan.gpaNode,
                gradeNode: plan.gradeNode,
                actualGPA: plan.actualGPA,
                unusedCreditDetails: plan.unusedCreditDetails || [],
                root: { children: processedChildren },
                _summary: {
                    totalCapacity: totalCapacity,
                    totalEarned: totalEarned,
                    totalEnrolled: totalEnrolled,
                    totalRemaining: Math.max(0, totalCapacity - totalEarned - totalEnrolled),
                    overallPct: overallPct,
                    enrolledPct: enrolledPct,
                    totalTests: totalTests,
                    testsPassed: testsPassed
                },
                _allExpanded: false,
                _unusedExpanded: false
            };
        }

        $scope.toggleUnused = function(plan) {
            plan._unusedExpanded = !plan._unusedExpanded;
        };

        $scope.togglePlan = function(plan) {
            var id = plan.gradPlan.id;
            $scope.expandedPlans[id] = !$scope.expandedPlans[id];
        };

        $scope.toggleNode = function(node) {
            node._expanded = !node._expanded;
        };

        $scope.toggleAllNodes = function(plan) {
            plan._allExpanded = !plan._allExpanded;
            function setExpanded(nodes, val) {
                nodes.forEach(function(n) {
                    n._expanded = val;
                    if (n.children && n.children.length) {
                        setExpanded(n.children, val);
                    }
                });
            }
            setExpanded(plan.root.children, plan._allExpanded);
        };

        if (!studentId) {
            $scope.loading = false;
            $scope.error = 'Student ID not found.';
            return;
        }

        $http.get('/ws/gradplanner/progress/' + studentId).then(function(response) {
            var data = response.data;
            if (!data || !data.length) {
                $scope.gradPlans = [];
            } else {
                $scope.gradPlans = data.map(processGradPlan);
                if ($scope.gradPlans.length > 0) {
                    $scope.expandedPlans[$scope.gradPlans[0].gradPlan.id] = true;
                }
            }
            $scope.loading = false;
        }, function(err) {
            $scope.loading = false;
            $scope.error = 'Failed to load graduation plan data. Please refresh the page.';
        });

    }]);
});
