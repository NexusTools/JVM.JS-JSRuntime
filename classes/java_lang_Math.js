(function(JVM) {
    JVM.RegisterBuiltIn("java/lang/Math", {
        '$impl': {
            'acos$(D)D': function($, val) {
                return Math.acos(val);
            },
            'tan$(D)D': function($, val) {
                return Math.tan(val);
            },
            'sin$(D)D': function($, val) {
                return Math.sin(val);
            },
            'cos$(D)D': function($, val) {
                return Math.cos(val);
            },
            'random$()D': function($) {
                return Math.random();
            },
				'min$(DD)D': function($, val1, val2) {
					return Math.min(val1, val2);
				},
				'max$(DD)D': function($, val1, val2) {
					return Math.max(val1, val2);
				},
				'round$(D)J': function($, val) {
					return Math.round(val);
				},
				'ceil$(D)J': function($, val) {
					return Math.ceil(val);
				},
				'floor$(D)J': function($, val) {
					return Math.floor(val);
				}
        }
    });
})(JVM);
