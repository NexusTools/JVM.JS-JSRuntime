(function(JVM) {
  var BLOCK_TRY = 0, BLOCK_LABEL = 1;
  JVM.CompileMethod = function(name, section, $data, impl) {
    var isStatic = section.access.indexOf(JVM.Flags.STATIC) != -1;
    var id = section.name + "$" + section.signature;
    var methodID = $data.classID + "." + section.name;
    var friendlyID = $data.friendlyName + "_$$_" + id.replace(/[^\w$]/g, "_");
    var source = "//@ sourceURL=" + methodID;
    source += "\n\nvar $ = this;";
    var bodysource = "function " + friendlyID + "() {", initSource = "";

    var isNative = true;
    try {
      if(section.implementation instanceof Array)
        isNative = false;
    } catch(e) {}

    if(isNative) {
      if(!$data.$native) {
        Object.defineProperty(impl, "$native", {
          value: $data.$native = {}
        });
        Object.defineProperty(impl, "$nativeData", {
          value: $data.$nativeData = {}
        });
      }

      var native = $data.self.nativeClasses[name];
      $data.$native[id] = (native && native[id]) || function() {
        var native = $data.nativeClasses[name];
        if(native && native[id]) {
          $data.$native[id] = native[id];
          return native[id].apply(this, arguments);
        }

        if(!native)
          console.error("Native class no registered", native);
        else
          console.error("Cannot find ", id, "in", native);
        throw new JavaErrors.UnsatisfiedLinkError($data.classID + "." + id);
      };

      source += "\nvar impl = $.native['" + id + "'];";
      source += "\nvar helper = {'jvm': $.jvm, 'shared': $.nativeData, 'classloader': $.classloader, 'impl': $.impl};";
      bodysource += "\n\treturn impl.call(this, helper";
      for(var i=0; i<section.sigparts.args.length; i++) {
        bodysource += ", arguments[" + i + "]";
      }
      bodysource += ");"
    } else {
      var crash = false;
      bodysource += "\n\tvar STACK=[], TARGET, IMPL;";
      try {
        var depth = "\n\t";

        var optimized = [], hasReturn, hasJumps, labels, hasTryCatch, startJumper = true;
        section.implementation.forEach(function(impl) {
          switch(impl.type) {
            case "try": //Skip
              hasTryCatch = hasReturn = true;
            case "jump":
            case "switch":
            case "switchtable":
              hasJumps = true;
              break;
          }
        });

        if(!hasJumps)
          section.implementation.forEach(function(impl) {
            switch(impl.type) {
              case "label": //Skip
              case "declare":
                break;

              case "insn":
                switch(impl.opcode) {
                  case JVM.Opcodes.D2I:
                  case JVM.Opcodes.I2D:
                  case JVM.Opcodes.D2F:
                  case JVM.Opcodes.MONITORENTER:
                  case JVM.Opcodes.MONITOREXIT:
                    return;
                }
              default:
                optimized.push(impl);
            }
          });
        else {
          labels = [];
          section.implementation.forEach(function(impl) {
            switch(impl.type) {
              case "declare": //Skip
                break;

              case "label": //Skip
                labels.push(impl.name);
              case "insn":
                switch(impl.opcode) {
                  case JVM.Opcodes.D2I:
                  case JVM.Opcodes.I2D:
                  case JVM.Opcodes.D2F:
                  case JVM.Opcodes.MONITORENTER:
                  case JVM.Opcodes.MONITOREXIT:
                    return;
                }
              default:
                optimized.push(impl);
            }
          });
        }

        var tryCatchPending = [];
        if(hasTryCatch) {
          var tryCatchImpl = []
          optimized.forEach(function(impl) {
            switch(impl.type) {
              case "try":
                tryCatchPending.push(impl);
                break;

              default:
                tryCatchImpl.push(impl);
            }
          });
          optimized = tryCatchImpl;
        }

        if(true) { // Loose
          var looseImplementation = []
          optimized.forEach(function(impl) {
            switch(impl.type) {
              case "type":
                switch(impl.opcode) {
                  case JVM.Opcodes.CHECKCAST:
                    return;
                }
                looseImplementation.push(impl);
                break;

              case "insn":
                switch(impl.opcode) {
                  case JVM.Opcodes.I2L:
                  case JVM.Opcodes.I2F:
                  case JVM.Opcodes.I2D:
                  case JVM.Opcodes.L2I:
                  case JVM.Opcodes.L2F:
                  case JVM.Opcodes.L2D:
                  case JVM.Opcodes.F2I:
                  case JVM.Opcodes.F2L:
                  case JVM.Opcodes.F2D:
                  case JVM.Opcodes.D2I:
                  case JVM.Opcodes.D2L:
                  case JVM.Opcodes.D2F:
                  case JVM.Opcodes.I2B:
                  case JVM.Opcodes.I2C:
                  case JVM.Opcodes.I2S:
                    return;
                }
              default:
                looseImplementation.push(impl);
            }
          });
          optimized = looseImplementation;
        }

        if(hasJumps && optimized[0].type != "label") {
          optimized.pop();
          optimized.push({
            type: "reset"
          });
          while(optimized[0].type != "label")
            optimized.push(optimized.shift());
          optimized.push({
            type: "end"
          });
        }

        var ref = {}, methodRef = {}, addRef, addMethodRef, addStringRef, stringRef = [];
        if(JVM.settings.allowOpt) {
          var classRefCount = 0;
          addRef = function(name) {
            if(!ref.hasOwnProperty(name))
              return ref[name] = "class" + (classRefCount++);
            return ref[name];
          };

          var methodRefCount = 0;
          addMethodRef = function(jclass, name) {
            var nameID = jclass + "@" + name;
            var classID = addRef(jclass);

            if(!methodRef.hasOwnProperty(nameID))
              methodRef[nameID] = [classID, "method" + (methodRefCount++), name];
            return methodRef[nameID];
          };

          addStringRef = function(value) {
            var index = stringRef.indexOf(value);
            if(index == -1) {
              index = stringRef.length;
              stringRef.push(value);
            }
            return index;
          };

          // Basic no argument super
          if(section.name == "<init>" && optimized[0].type == "var" && optimized[0].opcode == JVM.Opcodes.ALOAD && optimized[0].index == 0
             && optimized[1].type == "method" && optimized[1].name == "<init>" && optimized[1].opcode == JVM.Opcodes.INVOKESPECIAL) {

            optimized.shift();
            optimized[0] = {
              type: "super",
              ref: addMethodRef(optimized[0].owner, "<init>$()V")
            };
          }

          var secondLast = optimized.length-2; // Strip last return
          if(!hasJumps && secondLast >= 0 && optimized[secondLast].type == "insn") {
            if(optimized[secondLast].opcode == JVM.Opcodes.RETURN) {
              optimized.splice(secondLast, 1);
            } else if(optimized[secondLast].opcode == JVM.Opcodes.ARETURN) {
              optimized[secondLast] = {
                type: "return"
              };
            }
          }

          if(optimized.length == 1) {
            //if(section.access.indexOf(JVM.Flags.ABSTRACT) != -1)
            optimized.unshift({
              type: "virtual"
            });
          }

          var moreOptimized = [], stringRefs = 0, skipUntilLabel;
          optimized.forEach(function simple_optimizations(impl) {
            if(skipUntilLabel) {
              if(impl.type == "label")
                skipUntilLabel = false;
              else
                return;
            }

            switch(impl.type) {
              case "method":
                switch(impl.opcode) {
                  case JVM.Opcodes.INVOKESTATIC:
                    impl.opcode = JVM.Opcodes.INVOKESTATICREF;
                    impl.ref = addMethodRef(impl.owner, impl.name + "$" + impl.signature.raw);
                    break;
                  /*case JVM.Opcodes.INVOKEVIRTUAL:
                    var implSig = impl.name + "$" + impl.signature.raw;
                    try {
                      var ownerImpl = $data.self.loadClassImpl(impl.owner);
                      var funcImpl = ownerImpl.$method(implSig);
                      if(funcImpl.$flags.indexOf(JVM.Flags.FINAL)) {
                        impl.ref = addMethodRef(impl.owner, implSig);
                        impl.opcode = JVM.Opcodes.INVOKESPECIALREF;
                      }
                    } catch(e) {}
                    break;*/
                  case JVM.Opcodes.INVOKESPECIAL:
                    impl.opcode = JVM.Opcodes.INVOKESPECIALREF;
                    impl.ref = addMethodRef(impl.owner, impl.name + "$" + impl.signature.raw);

                    if(impl.name == "<init>")
                      impl.initref = addMethodRef(impl.owner, "_");
                    break;
                }
                break;
            }

            if(impl.type == "field" && impl.opcode == JVM.Opcodes.PUTSTATIC) {
              impl.opcode = JVM.Opcodes.PUTSTATICREF;
              impl.ref = addRef(impl.class);
            } else if(impl.type == "field" && impl.opcode == JVM.Opcodes.GETSTATIC) {
              impl.opcode = JVM.Opcodes.GETSTATICREF;
              impl.ref = addRef(impl.class);
            } else if(impl.type == "ldc" && impl.hasOwnProperty("stringValue")) {
              /*source += "\nvar string" + stringRefs + ";";
                                  bodysource += "\n\tvar string" + stringRefs + " = $.jvm.createString(";
                                  bodysource += JSON.stringify(impl.stringValue);
                                  bodysource += ");"*/

              impl.stringRef = addStringRef(impl.stringValue);
            } else if(impl.type == "jump" && impl.opcode == JVM.Opcodes.JUMP)
              skipUntilLabel = true;

            moreOptimized.push(impl);
          });
          optimized = moreOptimized;
        }

        if(JVM.settings.dumpOptimizations)
          console.log("Optimized", optimized, section.implementation);
        var hasMalleableLocal = false;
        optimized.forEach(function (impl){
          switch(impl.type) {
            case "insn":
              switch(impl.opcode) {
                case JVM.Opcodes.IRETURN:
                case JVM.Opcodes.LRETURN:
                case JVM.Opcodes.FRETURN:
                case JVM.Opcodes.DRETURN:
                case JVM.Opcodes.ARETURN:
                case JVM.Opcodes.RETURN:
                  hasReturn = true;
              }
              break;

            case "var":
              switch(impl.opcode) {
                case JVM.Opcodes.LSTORE:
                case JVM.Opcodes.ASTORE:
                  hasMalleableLocal = true;
              }
              break;
          }
        });
        var NEEDSARGS = hasMalleableLocal || hasJumps;
        var ARGSNAME = NEEDSARGS ? "ARGS" : "arguments";

        if(JVM.settings.allowOpt) {
          if(JVM.settings.optPasses) {
            var optimizations = [
              function simple_new_object(analysisSet) {
                if(analysisSet[0].type == "type"
                   && analysisSet[0].opcode == JVM.Opcodes.NEW
                   && analysisSet[1].type == "insn"
                   && analysisSet[1].opcode == JVM.Opcodes.DUP
                   && analysisSet[2].type == "method"
                   && (analysisSet[2].opcode == JVM.Opcodes.INVOKESPECIAL
                       || analysisSet[2].opcode == JVM.Opcodes.INVOKESPECIALREF)
                   && !analysisSet[2].signature.args.length) {

                  analysisSet.splice(0, 3, {
                    type: "new",
                    ref: addRef(analysisSet[2].owner)
                  });
                }
              },
              function get_field(analysisSet) {
                if(analysisSet[0].type == "var"
                   && analysisSet[0].opcode == JVM.Opcodes.ALOAD
                   && analysisSet[1].type == "field"
                   && analysisSet[1].opcode == JVM.Opcodes.GETFIELD) {

                  analysisSet.splice(0, 2, {
                    type: "field",
                    name: analysisSet[1].name,
                    opcode: JVM.Opcodes.GETALOAD,
                    index: analysisSet[0].index
                  });
                }
              }
            ];

            var subPasses = Math.max(1, JVM.settings.optSubPasses||1);
            var optimizePass = function(implementation) {
              var complete = [], analysisSet = [];

              var analyze = function(analysisSet) {
                optimizations.forEach(function(opt) {
                  try {
                    opt(analysisSet);
                  } catch(e) {
                    console.warn(e);
                  }
                });

              };
              implementation.forEach(function(impl) {
                analysisSet.push(impl);
                if(analysisSet.length >= 20) {
                  for(var i=0; i<subPasses; i++)
                    analyze(analysisSet);
                  complete.push(analysisSet.shift());
                }
              });
              while(analysisSet.length >= 2) {
                for(var i=0; i<subPasses; i++)
                  analyze(analysisSet);
                complete.push(analysisSet.shift());
              }
              while(analysisSet.length >= 1)
                complete.push(analysisSet.shift());

              return complete;
            }

            for(var i=0; i<JVM.settings.optPasses; i++) {
              optimized = optimizePass(optimized);
            }
          }

          if(Object.keys(ref).length || stringRef.length) {
            initSource = "function() {";
            for(var i=0; i<stringRef.length; i++) {
              source += "\nvar string" + i + ";";
              initSource += "\n\tstring" + i + " = $.jvm.createString(";
              initSource += JSON.stringify(stringRef[i]);
              initSource += ");"
            }
            for(var key in ref) {
              source += "\nvar " + ref[key] + ";";
              initSource += "\n\t" + ref[key] + " = $.classloader.loadClassImpl(";
              initSource += JSON.stringify(key) + ");";
            }
            if(Object.keys(methodRef).length) {
              for(var key in methodRef) {
                var data = methodRef[key];

                source += "\nvar " + data[1] + ";";
                initSource += "\n\t" + data[1] + " = " + data[0];
                initSource += ".$method(" + JSON.stringify(data[2]) + ");";
              }
            }
            initSource += "\n}";
          }
        }


        if(NEEDSARGS) {
          bodysource += depth + "var ARGS = ";
          if(hasMalleableLocal)
            bodysource += "Array.prototype.slice.call(";
          bodysource += "arguments";
          if(hasMalleableLocal) {
            bodysource += ", 0);";
          } else
            bodysource += ";";
        }
        if(hasReturn) {
          bodysource += depth + "var RET = function(val){this.val=val;};";
          bodysource += depth + "try {";
          depth += "\t";
        }
        if(hasJumps) {
          bodysource += depth + "var JUMPER = $.jvm.createJumper(RET);";
        }

        bodysource += depth;
        var depthStack = [];
        var resetDepth = function(to) {
          while(depthStack.length) {
            depth = depth.substring(0, depth.length-1);
            var frame = depthStack.pop();
            switch(frame[0]) {
              case BLOCK_TRY:
                bodysource += depth + "} catch(e) {";
                bodysource += depth + "\te = $.jvm.convertError(e);";

                // TODO: Loop through other available stack entries
                bodysource += depth + "\tif(java_instanceof(e, '";
                bodysource += frame[1].catch;
                bodysource += "')) {";
                bodysource += depth + "\t\tSTACK.push(e);";
                bodysource += depth + "\t\tJUMPER.jump(" + labels.indexOf(frame[1].handler) + ", this);";
                bodysource += depth + "\t}";

                bodysource += depth + "\tthrow e;";

                bodysource += depth + "}";
                break;

              case BLOCK_LABEL:
                bodysource += depth + "});";
                break;

              default:
                throw new Error("Unhandled depth type");
            }
            if(frame[0] === to)
              break;
          }
        }
        var addDepth = function(type, inst) {
          depthStack.push([type, inst]);
          depth += "\t";
        };

        var stackControl = {
          add: addDepth,
          reset: resetDepth,

          TRY: BLOCK_TRY,
          LABEL: BLOCK_LABEL
        }
        var isInsideLabel = function() {
          var yes = false;
          depthStack.forEach(function(stack) {
            if(stack[0] == BLOCK_LABEL)
              yes = true;
          })
          return yes;
        }

        var tryCatch = [];
        optimized.forEach(function(impl) {
          if(JVM.settings.dumpImpl)
            bodysource += depth + "// " + JSON.stringify(impl);


          switch(impl.type) {
            case "return":
              bodysource += depth + "return STACK.pop();";
              break;

            case "new":
              bodysource += depth + "STACK.push(" + impl.ref + ".$new());";
              break;

            case "reset":
              resetDepth();
              break;

            case "jump":
              if(JVM.settings.dumpStack)
                bodysource += depth + "console.log(\"IF\", $.jvm.dumpStack(STACK));";
              var more = "\t";
              switch(impl.opcode) {
                case JVM.Opcodes.IF_ICMPEQ:
                case JVM.Opcodes.IF_ACMPEQ:
                  bodysource += depth + "if(STACK.pop() === STACK.pop())";
                  break;

                case JVM.Opcodes.IF_ICMPNE:
                case JVM.Opcodes.IF_ACMPNE:
                  bodysource += depth + "if(STACK.pop() !== STACK.pop())";
                  break;

                case JVM.Opcodes.IF_ICMPLT:
                  bodysource += depth + "if(STACK.pop() > STACK.pop())";
                  break;

                case JVM.Opcodes.IF_ICMPLE:
                  bodysource += depth + "if(STACK.pop() >= STACK.pop())";
                  break;

                case JVM.Opcodes.IF_ICMPGT:
                  bodysource += depth + "if(STACK.pop() < STACK.pop())";
                  break;

                case JVM.Opcodes.IF_ICMPGE:
                  bodysource += depth + "if(STACK.pop() <= STACK.pop())";
                  break;

                case JVM.Opcodes.IFGE:
                  bodysource += depth + "if(STACK.pop() >= 0)";
                  break;

                case JVM.Opcodes.IFGT:
                  bodysource += depth + "if(STACK.pop() > 0)";
                  break;

                case JVM.Opcodes.IFLE:
                  bodysource += depth + "if(STACK.pop() <= 0)";
                  break;

                case JVM.Opcodes.IFLT:
                  bodysource += depth + "if(STACK.pop() < 0)";
                  break;

                case JVM.Opcodes.IFEQ:
                  bodysource += depth + "if(!STACK.pop())";
                  break;

                case JVM.Opcodes.IFNE:
                  bodysource += depth + "if(STACK.pop())";
                  break;
                  
                case JVM.Opcodes.IFNULL:
                  bodysource += depth + "if(STACK.pop() == null)";
                  break;
                  
                case JVM.Opcodes.IFNONNULL:
                  bodysource += depth + "if(STACK.pop() != null)";
                  break;

                case JVM.Opcodes.GOTO:
                  more = "";
                  break;

                default:
                  throw new Error("Unknown jump opcode: " + impl.opcode);
              }

              
              bodysource += depth + more;
              var inLabel = isInsideLabel();
              if(inLabel)
                bodysource += "return ";
              else
                bodysource += "JUMPER.start(this, ";
              bodysource += labels.indexOf(impl.name);
              if(!inLabel)
                bodysource += ")";
              bodysource += "; // JUMP";
              break;

            case "label":
              resetDepth(BLOCK_LABEL);

              bodysource += depth + "JUMPER.push(function " + impl.name + "() {";
              addDepth(BLOCK_LABEL);

              var tryCatchRemaining;
              if(tryCatchPending.length) {
                tryCatchRemaining = [];
                tryCatchPending.forEach(function(tryImpl) {
                  if(tryImpl.start == impl.name) {
                    tryCatch.push(tryImpl);
                  } else
                    tryCatchRemaining.push(tryImpl);
                });
                tryCatchPending = tryCatchRemaining;
              }

              if(tryCatch.length) {
                tryCatchRemaining = [];
                tryCatch.forEach(function(tryImpl) {
                  if(tryImpl.end == impl.name)
                    return;

                  bodysource += depth + "try {";
                  addDepth(BLOCK_TRY, tryImpl);

                  tryCatchRemaining.push(tryImpl);
                });
                tryCatch = tryCatchRemaining;
              }

              break;

            case "type":
              switch(impl.opcode) {
                case JVM.Opcodes.INSTANCEOF:
                  bodysource += depth + "TARGET=STACK.pop();";
                  bodysource += depth + "if(TARGET == null)";
                  bodysource += depth + "\tSTACK.push(0);";
                  bodysource += depth + "else";
                  bodysource += depth + "\tSTACK.push(java_instanceof(TARGET, " + JSON.stringify(impl.signature) + ") ? 1 : 0);";
                  break;
                  
                case JVM.Opcodes.NEW:
                  bodysource += depth + "STACK.push($.jvm.newObject());";
                  break;

                case JVM.Opcodes.NEWARRAY:
                case JVM.Opcodes.ANEWARRAY:
                  bodysource += depth + "STACK.pop(); // Discard size";
                  bodysource += depth + "STACK.push([]);";
                  break;

                default:
                  throw new Error("Unknown type opcode: " + impl.opcode);
              }
              break;

            case "virtual":
              bodysource += depth + "throw new $.error.VirtualMachineError('Pure Virtual Method: ' + " + JSON.stringify(section.name) + ");";
              break;

            case "field":
              switch(impl.opcode) {
                case JVM.Opcodes.GETSTATIC:
                  bodysource += depth + "STACK.push($.classloader.loadClassImpl(" + JSON.stringify(impl.class) + ").$prop[" + JSON.stringify(impl.name) + "]);";
                  break;

                case JVM.Opcodes.PUTSTATIC:
                  bodysource += depth + "$.classloader.loadClassImpl(" + JSON.stringify(impl.class) + ").$prop[" + JSON.stringify(impl.name) + "] = STACK.pop();";
                  break;

                case JVM.Opcodes.PUTSTATICREF:
                  bodysource += depth + impl.ref + ".$prop[" + JSON.stringify(impl.name) + "] = STACK.pop();";
                  break;

                case JVM.Opcodes.GETSTATICREF:
                  bodysource += depth + "STACK.push(" + impl.ref + ".$prop[" + JSON.stringify(impl.name) + "]);";
                  break;

                case JVM.Opcodes.GETFIELD:
                  if(JVM.settings.dumpStack)
                    bodysource += depth + "console.log(\"GETFIELD\", " + JSON.stringify(impl.name) + ", $.jvm.dumpStack(STACK));";

                  bodysource += depth + "STACK.push(STACK.pop().$prop[" + JSON.stringify(impl.name) + "]);";
                  break;

                case JVM.Opcodes.PUTFIELD:
                  if(JVM.settings.dumpStack)
                    bodysource += depth + "console.log(\"PUTFIELD\", " + JSON.stringify(impl.name) + ", $.jvm.dumpStack(STACK));";

                  bodysource += depth + "TARGET = STACK.pop();";
                  bodysource += depth + "STACK.pop().$prop[" + JSON.stringify(impl.name) + "] = TARGET;";
                  break;

                case JVM.Opcodes.GETALOAD:
                  bodysource += depth + "STACK.push(";
                  if(isStatic)
                    bodysource += ARGSNAME + "[" + impl.index + "]";
                  else {
                    impl.index--;
                    if(impl.index < 0)
                      bodysource += "this";
                    else
                      bodysource += ARGSNAME + "[" + impl.index + "]";
                  }
                  bodysource += ".$prop[" + JSON.stringify(impl.name) + "]);";
                  break;

                default:
                  throw new Error("Unknown field opcode: " + impl.opcode);
              }
              break;

            case "declare":
              break;

            case "end":
              if(hasJumps) {
                resetDepth();
                bodysource += depth + "JUMPER.start(this);";
              }
              break;

            case "insn":
              switch(impl.opcode) {
                case JVM.Opcodes.INEG:
                  bodysource += depth + "STACK.push(-STACK.pop());";
                  break;

                case JVM.Opcodes.ARRAYLENGTH:
                  bodysource += depth + "STACK.push(STACK.pop().length);";
                  break;

                case JVM.Opcodes.AALOAD:
                case JVM.Opcodes.BALOAD:
                case JVM.Opcodes.CALOAD:
                  bodysource += depth + "STACK.push(STACK.splice(STACK.length-2, 1)[0][STACK.pop()]);";
                  break;

                case JVM.Opcodes.AASTORE:
                case JVM.Opcodes.BASTORE:
                case JVM.Opcodes.CASTORE:
                  bodysource += depth + "STACK.splice(STACK.length-3, 1)[0][STACK.splice(STACK.length-2, 1)[0]] = STACK.pop();";

                  break;

                case JVM.Opcodes.POP:
                  bodysource += depth + "STACK.pop();";
                  break;

                case JVM.Opcodes.ATHROW:
                  bodysource += depth + "throw STACK.pop();";
                  break;

                case JVM.Opcodes.ACONST_NULL:
                  bodysource += depth + "STACK.push(null);";
                  break;

                case JVM.Opcodes.RETURN:
                  bodysource += depth + "throw new RET();";
                  break;

                case JVM.Opcodes.LCMP:
                case JVM.Opcodes.FCMPL:
                case JVM.Opcodes.DCMPL:
                  bodysource += depth + "TARGET=[STACK.pop(),STACK.pop()];";
                  bodysource += depth + "if(TARGET[0] == TARGET[1])";
                  bodysource += depth + "\tSTACK.push(0);";
                  bodysource += depth + "else if(TARGET[0] < TARGET[1])";
                  bodysource += depth + "\tSTACK.push(-1);";
                  bodysource += depth + "else";
                  bodysource += depth + "\tSTACK.push(1);";
                  break;

                case JVM.Opcodes.FCMPG:
                case JVM.Opcodes.DCMPG:
                  bodysource += depth + "TARGET=[STACK.pop(),STACK.pop()];";
                  bodysource += depth + "if(TARGET[0] == TARGET[1])";
                  bodysource += depth + "\tSTACK.push(0);";
                  bodysource += depth + "else if(TARGET[0] < TARGET[1])";
                  bodysource += depth + "\tSTACK.push(1);";
                  bodysource += depth + "else";
                  bodysource += depth + "\tSTACK.push(-1);";
                  break;

                case JVM.Opcodes.IRETURN:
                case JVM.Opcodes.LRETURN:
                case JVM.Opcodes.FRETURN:
                case JVM.Opcodes.DRETURN:
                case JVM.Opcodes.ARETURN:
                  bodysource += depth + "throw new RET(STACK.pop());";
                  break;

                case JVM.Opcodes.IADD:
                case JVM.Opcodes.DADD:
                case JVM.Opcodes.FADD:
                case JVM.Opcodes.LADD:
                  bodysource += depth + "TARGET=STACK.pop();";
                  bodysource += depth + "STACK[STACK.length-1] = STACK[STACK.length-1] + TARGET;";
                  break;

                case JVM.Opcodes.ISUB:
                case JVM.Opcodes.DSUB:
                case JVM.Opcodes.FSUB:
                case JVM.Opcodes.LSUB:
                  bodysource += depth + "TARGET=STACK.pop();";
                  bodysource += depth + "STACK[STACK.length-1] = STACK[STACK.length-1] - TARGET;";
                  break;

                case JVM.Opcodes.IMUL:
                case JVM.Opcodes.DMUL:
                case JVM.Opcodes.FMUL:
                case JVM.Opcodes.LMUL:
                  bodysource += depth + "TARGET=STACK.pop();";
                  bodysource += depth + "STACK[STACK.length-1] = STACK[STACK.length-1] * TARGET;";
                  break;

                case JVM.Opcodes.IDIV:
                case JVM.Opcodes.DDIV:
                case JVM.Opcodes.FDIV:
                case JVM.Opcodes.LDIV:
                  bodysource += depth + "TARGET=STACK.pop();";
                  bodysource += depth + "STACK[STACK.length-1] = STACK[STACK.length-1] / TARGET;";
                  break;

                case JVM.Opcodes.IAND:
                case JVM.Opcodes.LAND:
                  bodysource += depth + "TARGET=STACK.pop();";
                  bodysource += depth + "STACK[STACK.length-1] = STACK[STACK.length-1] & TARGET;";
                  break;

                case JVM.Opcodes.IOR:
                case JVM.Opcodes.LOR:
                  bodysource += depth + "TARGET=STACK.pop();";
                  bodysource += depth + "STACK[STACK.length-1] = STACK[STACK.length-1] | TARGET;";
                  break;

                case JVM.Opcodes.IREM:
                case JVM.Opcodes.DREM:
                case JVM.Opcodes.FREM:
                case JVM.Opcodes.LREM:
                  bodysource += depth + "TARGET=STACK.pop();";
                  bodysource += depth + "STACK[STACK.length-1] = STACK[STACK.length-1] % TARGET;";
                  break;

                case JVM.Opcodes.DUP:
                  bodysource += depth + "STACK.push(STACK[STACK.length-1]);";
                  break;

                case JVM.Opcodes.DUP_X1:
                  bodysource += depth + "STACK[STACK.length-3] = STACK[STACK.length-1];";
                  break;

                case JVM.Opcodes.DUP_X2:
                  bodysource += depth + "STACK[Math.max(0, STACK.length-4)] = STACK[STACK.length-1];";
                  break;

                case JVM.Opcodes.ICONST_M1:
                  bodysource += depth + "STACK.push(-1);";
                  break;

                case JVM.Opcodes.ICONST_0:
                case JVM.Opcodes.FCONST_0:
                case JVM.Opcodes.DCONST_0:
                case JVM.Opcodes.LCONST_0:
                  bodysource += depth + "STACK.push(0);";
                  break;

                case JVM.Opcodes.ICONST_1:
                case JVM.Opcodes.FCONST_1:
                case JVM.Opcodes.DCONST_1:
                case JVM.Opcodes.LCONST_1:
                  bodysource += depth + "STACK.push(1);";
                  break;

                case JVM.Opcodes.ICONST_2:
                case JVM.Opcodes.FCONST_2:
                  bodysource += depth + "STACK.push(2);";
                  break;

                case JVM.Opcodes.ICONST_3:
                  bodysource += depth + "STACK.push(3);";
                  break;

                case JVM.Opcodes.ICONST_4:
                  bodysource += depth + "STACK.push(4);";
                  break;

                case JVM.Opcodes.ICONST_5:
                  bodysource += depth + "STACK.push(5);";
                  break;

                default:
                  throw new Error("Unknown insn opcode: " + impl.opcode);
              }
              break;

            case "ldc":
              if("numericValue" in impl)
                bodysource += depth + "STACK.push(" + impl.numericValue + ");";
              else if("stringRef" in impl)
                bodysource += depth + "STACK.push(string" + impl.stringRef + ");";
              else if("objectRef" in impl)
                bodysource += depth + "STACK.push($.jvm.ClassLoader.loadClassImpl(" + JSON.stringify(impl.objectRef) + ").class);";
              else if("stringValue" in impl) {
                if(impl.stringValue == undefined)
                  bodysource += depth + "STACK.push($.jvm.createString(" + JSON.stringify(impl.stringValue) + "));";
              } else
                throw new Error("Unknown LDC Value");
              break;

            case "initobject":
              bodysource += depth + "$.jvm.Object.apply(this, []);";
              break;

            case "super":
              if(JVM.settings.verbose)
                console.log("Has ref", impl);
              bodysource += depth + impl.ref[1] + ".call(this)";
              break;

            case "method":
              var ownerID = impl.owner.replace(/\//g, ".");

              bodysource += depth;
              if(JVM.settings.dumpStack) {
                bodysource += depth + "console.log(\"";
                bodysource += ownerID;
                bodysource += ".";
                bodysource += impl.name;
                bodysource += impl.signature.raw;
                bodysource += "\", $.jvm.dumpStack(STACK), ";
                bodysource += impl.opcode;
                bodysource += ");";
              }

              var target;
              var argumentCount = impl.signature.args.length;
              if(impl.opcode == JVM.Opcodes.INVOKESPECIAL
                 || impl.opcode == JVM.Opcodes.INVOKESPECIALREF) {
                bodysource += depth + "TARGET=STACK.splice(STACK.length-";
                bodysource += argumentCount+1;
                bodysource += ", 1)[0];";

                // TODO: Detect super calls
                if(impl.name == "<init>") {
                  if(impl.initref)
                    bodysource += depth + impl.initref[1] + ".call(TARGET);";
                  else
                    bodysource += depth + ((impl.ref && impl.ref[0]) || "$.classloader.loadedClasses[" + JSON.stringify(ownerID) + "]") + ".$impl._.call(TARGET);";
                }
                if(impl.ref)
                  target = impl.ref[1];
                else
                  target = "$.classloader.loadedClasses[" + JSON.stringify(ownerID) + "].$impl['" + impl.name + "$" + impl.signature.raw + "']";
              } else if(impl.opcode == JVM.Opcodes.INVOKEINTERFACE
                        || impl.opcode == JVM.Opcodes.INVOKEVIRTUAL) {
                bodysource += depth + "TARGET=STACK.splice(STACK.length-";
                bodysource += argumentCount+1;
                bodysource += ", 1)[0]";

                target = "$.classloader.lookupImpl(TARGET, '" +impl.name + "$" + impl.signature.raw + "')";
              } else if(impl.opcode == JVM.Opcodes.INVOKESTATICREF)
                target = impl.ref[1];
              else if(impl.opcode == JVM.Opcodes.INVOKESTATIC)
                target = "$.classloader.loadedClasses[" + JSON.stringify(ownerID) + "].$impl['" + impl.name + "$" + impl.signature.raw + "']";
              else
                throw new Error("Unknown method opcode: " + impl.opcode);

              bodysource += depth;
              var isVoidMethod = impl.signature.return === JVM.Types.VOID;
              if(!isVoidMethod)
                bodysource += "STACK.push(";

              bodysource += target;
              if(argumentCount) {
                bodysource += ".apply(";
                if(impl.opcode == JVM.Opcodes.INVOKESTATIC
                   || impl.opcode == JVM.Opcodes.INVOKESTATICREF) {
                  bodysource += "null, STACK.splice(STACK.length-";
                  bodysource += argumentCount;
                  bodysource += ", ";
                  bodysource += argumentCount;
                  bodysource += ")";
                } else if(impl.opcode == JVM.Opcodes.INVOKESPECIAL
                          || impl.opcode == JVM.Opcodes.INVOKESPECIALREF
                          || impl.opcode == JVM.Opcodes.INVOKEINTERFACE
                          || impl.opcode == JVM.Opcodes.INVOKEVIRTUAL) {
                  bodysource += "TARGET, STACK.splice(STACK.length-";
                  bodysource += argumentCount;
                  bodysource += ", ";
                  bodysource += argumentCount;
                  bodysource += ")";
                } else {
                  bodysource += "STACK.splice(STACK.length-";
                  bodysource += argumentCount+1;
                  bodysource += ", 1)[0], STACK.splice(STACK.length-";
                  bodysource += argumentCount;
                  bodysource += ", ";
                  bodysource += argumentCount;
                  bodysource += ")";
                }
              } else if(impl.opcode == JVM.Opcodes.INVOKESTATIC
                        || impl.opcode == JVM.Opcodes.INVOKESTATICREF)
                bodysource += "(";
              else if(impl.opcode == JVM.Opcodes.INVOKESPECIAL
                      || impl.opcode == JVM.Opcodes.INVOKESPECIALREF
                      || impl.opcode == JVM.Opcodes.INVOKEINTERFACE
                      || impl.opcode == JVM.Opcodes.INVOKEVIRTUAL)
                bodysource += ".call(TARGET";
              else
                bodysource += ".call(STACK.pop()";
              bodysource += ")";

              if(!isVoidMethod)
                bodysource += ')';
              bodysource += ";";
              bodysource += depth;
              break;

            case "int":
              switch(impl.opcode) {
                case JVM.Opcodes.BIPUSH:
                case JVM.Opcodes.SIPUSH:
                  bodysource += depth + "STACK.push(" + impl.operand + ");";
                  break;
                  
                case JVM.Opcodes.NEWARRAY:
                  bodysource += depth + "STACK.pop(); // Discard size";
                  bodysource += depth + "STACK.push([]);";
                  break;

                default:
                  throw new Error("Unknown int opcode: " + impl.opcode);

              }
              break;

            case "var":
              switch(impl.opcode) {
                case JVM.Opcodes.ALOAD:
                case JVM.Opcodes.LLOAD:
                case JVM.Opcodes.FLOAD:
                case JVM.Opcodes.DLOAD:
                case JVM.Opcodes.ILOAD:
                  if(!isStatic)
                    impl.index --;
                  if(impl.index < 0)
                    bodysource += depth + "STACK.push(this);";
                  else
                    bodysource += depth + "STACK.push(" + ARGSNAME + "[" + impl.index + "]);";
                  break;

                case JVM.Opcodes.ASTORE:
                case JVM.Opcodes.LSTORE:
                  if(!isStatic)
                    impl.index --;
                  if(impl.index < 0)
                    throw new JavaErrors.IllegalArgumentException("STORE called for this");
                  else
                    bodysource += depth + ARGSNAME + "[" + impl.index + "] = STACK.pop();";
                  break;

                default:
                  throw new Error("Unknown var opcode: " + impl.opcode);
              }

              break;

            case "iinc":
              if(!isStatic)
                impl.index--;
              bodysource += depth + ARGSNAME + "[" + impl.index + "] += " + impl.by + ";";
              break;

            default:
              console.error(impl);
              throw new Error("Unknown implementation section: " + impl.type);
          }
          if(JVM.settings.dumpImpl)
            bodysource += depth;
        });


      } catch(e) {
        console.warn(e);
        console.log("Unfinished source `" + source + bodysource + "`");
        throw e;
      }

      if(hasReturn) {
        bodysource += "\n\t} catch(e) {";
        bodysource += "\n\t\tif(e instanceof RET)";
        bodysource += "\n\t\t\treturn e.val;";
        bodysource += "\n\t\te = $.jvm.convertError(e);";

        bodysource += "\n\t\tthrow e;";
        bodysource += "\n\t}";
      }
    }
    bodysource += "\n}";

    source += "\n([";
    if(initSource)
      source += initSource;
    else
      source += "null";
    source += ",";
    source += bodysource;
    source += "])";

    if(crash || JVM.settings.dumpSource)
      console.log("Compiled source `" + source + "`");
    if(crash)// || methodID == "webtest.WebTest.b.run")
      throw new Error();

    var helper = {
      jvm: $data.self.$jvm,
      classloader: $data.self,

      impl: $data.$impl,
      prop: $data.$prop,
      native: $data.$native,
      nativeData: $data.$nativeData,

      error: JavaErrors
    };
    var func = (function source_eval_helper() {
      //console.trace("Compiling source");
      try {
        return eval(source);
      } catch(e) {
        console.error("Failed to compile", source);
        console.log(e.message, e.stack);

        throw e;
      }
    }).call(helper);

    if(func[0]) {
      var init = func[0];
      $data.inits.push(function() {
        try {
          init();
        } catch(e) {
          e = $data.self.$jvm.convertError(e);
          java_printstacktrace(e);

          $data.$impl[id] = function() {
            throw e;
          }
        }
      });
    }
    func = func[1];
    Object.defineProperty(func, "$flags", {
      value: section.access
    });

    if(section.name == "<clinit>")
      $data.inits.push(func);

    if(section.access.indexOf(JVM.Flags.PRIVATE) != -1 || section.access.indexOf(JVM.Flags.PROTECTED) != -1)
      func = java_notpublic_wrap(func);
    if(section.access.indexOf(JVM.Flags.STATIC) != -1)
      func = java_static_wrap(func);
    func = $data.$impl[id] = func;

    func.toString = function() {
      return methodID;
    };
  }
})(JVM);
