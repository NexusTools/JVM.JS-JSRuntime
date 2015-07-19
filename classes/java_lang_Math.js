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
            }
        }
    });
})(JVM);