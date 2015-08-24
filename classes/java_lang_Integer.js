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
				'intValue$()I': function($) {
					return this.$prop._value;				
				},
            'toString$()Ljava/lang/String;': function($) {
                return $.jvm.createString(""+this.$prop._value);
            },
				'valueOf$(Ljava/lang/String;)Ljava/lang/Integer;': function($, val) {
					var int = $.jvm.createObject("java/lang/Integer");
					int.$prop._value = parseInt(val.$prop._value);
					return int;
				}
        },
        '$super': 'java/lang/Number'
    });
})(JVM);
