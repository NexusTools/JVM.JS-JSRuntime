(function(JVM) {
    JVM.RegisterBuiltIn("java/lang/Integer", {
        '$impl': {
            'valueOf$(I)Ljava/lang/Integer;': java_static_wrap(function($, val) {
                var int = $.jvm.initializeObject("java/lang/Integer");
                Object.defineProperty(int.$prop, "_value", {
                    value: val
                });
                return int;
            }),
            'toString$()Ljava/lang/String;': function($) {
                return $.jvm.createString(""+this.$prop._value);
            }
        },
        '$super': 'java/lang/Number'
    });
})(JVM);