(function(JVM) {
    JVM.RegisterBuiltIn("java/lang/ReflectiveOperationException", {
        '$impl': {
            '<init>$()V': function() {
                $.jclass.$super.$impl['<init>$()V'].call(this);
            },
            '<init>$(Ljava/lang/String;)V': function($, msg) {
                $.jclass.$super.$impl['<init>$(Ljava/lang/String;)V'].call(this, msg);
            }
        },
        '$super': 'java/lang/Exception'
    });
})(JVM);
