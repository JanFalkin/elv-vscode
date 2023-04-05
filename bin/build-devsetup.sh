#!/bin/bash

# Installer script that setup content-fabric and elvmasterd in dev mode

set -Eeuo pipefail

# constants
space_owner="0x81679e1b01aa38c04ca5aec757432d10fda01dfd"
space_owner_private_key="b67bffcebaa19782243b27d8b940ee011cd4e432d40769f788f174fad53f870b"

user="0xbb1039015306e4239c844f47ce0655f27b6744ae"
user_private_key="8abeb47a19727df68d71c7eeb0ea603a25d622346d94f5acd2ea4f0796636906"

kms_account="0xd9dc97b58c5f2584062cf69775d160ed9a3bfbc4"
kms_id="ikms433LwsH2LqfSvYtAFL7hnNWikLXd"
kms_public_key="kepkscLtX6mfBHpQUsZCEDK8rZ3VN2wKBkPC4ucVXrBZQxg3"
kms_private_key="5a59693d04b5066d96bfe77a01ed0d719169c198d9243c4c0a4d9bc06329c1d8"

qfab_node_account="26189c21e8387b9c50b780b91ce012ff676eb050"
qfab_node_id="inodXnRMo5b4svum81wHZtvpDq9DtUf"
qfab_node_passphrase="test"

network_id=955101
chain_id=955101
port=40403
rpcport=8545
elvport=6545

qfabport=8008

# for peer node
peer_enc_block="H4sIAAAAAAAA/6yUQY8rNwjHv4vPcwDbGDvHqodW6rUfADDeHTXJpMlE2tenfPcqL21W2tM87XID2z/4C8z3YMtxzC9h9z3Yq8zH33v\
YNSIEnMLrcvDL6tJ/2S/2V9jBFHw+IcFH/ze5vIZdgDf4pIX/iPQhQ3339ds/clzn6+E9ZPv576vfJZz8PC/98e602GvYIQDcblM4LkfzR41hCut8VyaH0z\
Pib+tZfpVVvkRHxcLNUQFFUjXIJiRuTJxT7AijC2Af/bN5Pm9hCi9y+WM+zOsP5Zgw9h/hPo8x23W/fnschCkc5revbLUt81Hl4j/FC1OQ/X6xe7tjwdoso\
tdUWZsRKFfQhuaAcYzCxRUI7ndV9vL/CEjn6mokVuIDeptCxpIko+aUTAeRUU0lcbGMfCdpzw7dt8G2DsBHGJIM7FyVquUnrfWIllyl8eCKCQoyOFVOiTBi\
Vq+ZWqmbSlNFSA2QEhTPMTWrOY/M5lCIRmQtnLP4Jlhv3Rrfq6URqWYo0UZpzNSxgPcmSYda3gYbCkUtu0UFRKqYlbMXK9zFINdOjZOnTTBvrNXMRx6OKTG\
3FlNqHsdorDiYkCHS2AYb2UsioTEqxz6SUITecm/YrUSkJsVLlk2wwalmj0ARS+mluErFGnMaOamwUgJsibfA7ovtelA/P/fYi1z+vHh/+ic5+3H9ul97+z\
cAAP//HrSLxjIGAAA="
peer_port=40404
peer_rpcport=8546
peer_elvport=6546
peer_mnemonic="yard fix balance mirror produce cannon swap ride enter orbit castle tiger"
peer_passphrase="test"
peer_accounts=2
static_nodes="enode://9f8c40c9dc309e11a51e833a811991e105836f9a776cf938734db6c87d0dce7d6b4a6ae100b61987d8deec7f71d0a7c73c5fce5b84c57940fb536944fa2ba09d@127.0.0.1:40304"

for i in {0..100}
do
  separator1+="-"
  separator2+="="
done

trap 'cleanup_int' INT
trap 'cleanup_exit' EXIT

exit_process(){
    if ps -p "$1" > /dev/null
    then
            kill "$1"
    fi
}

cleanup(){
    if [[ -n ${P1+x} ]]; then
    # EXIT elvmasterd
    exit_process $P1
    fi

    if [[ -n ${P2+x} ]]; then
        # EXIT qfab daemon
        exit_process $P2
    fi

    if [[ -n ${P3+x} ]]; then
        # EXIT elvmasterd peer
        exit_process $P3
    fi
}

cleanup_int(){
    cleanup
    exit 1
}

cleanup_exit(){
    cleanup
    exit 0
}

# help function used when input parameters are empty
help_function()
{
    echo ""
    echo "Usage : ./build-devsetup.sh <elvmasterd_path> <qfab_path> <qfab_cli_path> --peer"
    echo -e "\t <elvmasterd_path> - elvmasterd binary file path"
    echo -e "\t <qfab_path> - qfab binary file path"
    echo -e "\t <qfab_cli_path> - qfab_cli binary file path"
    echo -e "\t --dir - directory for dev setup, where 'RUN' folder is created [absolute path] (default pwd)"
    echo -e "\t --peer - enable creation of peer"
    echo -e "\t --network-id - provide network id (default 955101)"
    echo -e "\t --elvmaster-port - Network p2p listening port (default 40403)"
    echo -e "\t --elvmaster-rpcport - HTTP-RPC server listening port (default 8545)"
    echo -e "\t --elvmaster-elvport - Elv service port (default 6545)"
    echo -e "\t --fabric-port - fabric port (default 8008)"
    echo -e "\t --help - help for build-devsetup"
    exit 0 # Exit script after printing help
}


print_input_data()
{
    echo ""
    echo "parameters entered...
        elvmasterd=${elvmasterd}
        qfab=${qfab}
        qfab_cli=${qfab_cli}"
    echo ""
    echo ""
    echo "dir=${dir}

    In DEV mode:

        space-owner=${space_owner}
        space_owner_private_key=${space_owner_private_key}
        user=${user}
        user_private_key=${user_private_key}

        kms_account=${kms_account}
        kms_id=${kms_id}
        kms_public_key=${kms_public_key}
        kms_private_key=${kms_private_key}

        qfab_node_account=${qfab_node_account}
        qfab_node_id=${qfab_node_id}

        eth_url=${eth_url}
        qfab_url=$qfab_url
        network_id=${network_id}

        port=${port}
        rpcport=${rpcport}
        elvport=${elvport}

    "

    if [[ $create_peer -eq 1 ]]; then
    echo "For PEERS:
        elv-master dir=${elvmaster_peer_dir}
        enc_block=${peer_enc_block}
        static-nodes=${static_nodes}
        port=${peer_port}
        rpcport=${peer_rpcport}
        elvport=${peer_elvport}
        mnemonic=${peer_mnemonic}
        passphrase=${peer_passphrase}
        accounts=${peer_accounts}
    "
    fi

    echo "$separator1"
}

print_output()
{
    if [[ -d "${dir}" ]]; then
        echo ""
        echo ""
        echo "$separator2"
        echo "$separator2"
        echo ""
        echo "NEXT STEPS: "
        echo "==========="
        echo ""
        echo "Run ELVMASTERD node : elvmasterd start dev --console --config=${elvmasterd_dev_config_file}"
        echo "Run QFAB daemon : "
        echo "  export ELV_WALLET_PASSPHRASE=\"test\""
        echo "  qfab daemon --config ${qfab_config_file}"
        if [[ ${create_peer} -eq 1 ]];then
            echo "To run ELVMASTERD PEER node : elvmasterd start --config=${elvmasterd_peer_config_file}"
        fi
        echo ""
        echo ""
        echo "Config Url : \"http://localhost:${qfabport}/config?qspace=dev&self\""
        echo ""
        echo "Run TENANT Initialize script:"
        echo "In elv-client-js/testScripts,"
        echo "PRIVATE_KEY=${space_owner_private_key} node InitializeTenant --configUrl \"http://localhost:${qfabport}/config?qspace=dev&self\" --kmsId ${kms_id} ---tenantName \"dev-tenant\""
        echo ""
        echo "QFAB_CLI: "
        echo "CLI CONFIG files are as follows:"
        echo "SPACE OWNER qfab cli config file: ${qfab_cli_space_owner_config_file}"
        echo "USER qfab cli config file: ${qfab_cli_user_config_file}"
        echo "KMS qfab cli config file: ${qfab_cli_kms_config_file}"
        echo ""
        echo "In below steps we can use USER qfab_cli config file:"
        echo ""
        echo "1. For node list : qfab_cli space node list --config=${qfab_cli_user_config_file}"
        echo "2. For kms list : qfab_cli space kms list ${kms_id} --config=${qfab_cli_user_config_file}"
        echo "3. For bitcode: qfab_cli space bitcode <bitcode_file> --config=${qfab_cli_user_config_file}"
        echo "4. For publishing : qfab_cli submit <media_toml_file_path> --library=${libraryid} --type=<content_type_hash_from_step 3> --config=${qfab_cli_user_config_file}"
        echo "5. To get content access token : qfab_cli content token create ${libraryid} <content_id_from_submit_cmd> --config=${qfab_cli_user_config_file}"
        echo ""
        echo ""
        echo ""
        echo ""
        echo "To Note:"
        echo "* DIR containing qfab and elvmasterd details : '${dir}'"
        echo "* CONFIG files are present at : '${config_path}'"
        echo "* LOG files are present at : '${dir}'"
        echo "* QFAB_NODE private key file : '${qfab_privkey}'"
        if [[ ${create_peer} -eq 1 ]];then
        echo "* elvmasterd PEER node details : '${elvmaster_peer_dir}'"
        fi
        echo ""
        echo ""
        echo "$separator2"
        echo "$separator2"
    fi
}

create_dir()
{
    if [[ -d "${1}" ]]; then
        echo "ERROR: Directory $1 already exists."
        exit 1
    fi

    mkdir "${1}"
    if [[ $? -ne 0 ]] ; then
        echo "ERROR: Failure creating directory : ${1}"
    fi
}

check_port()
{
    if [[ $(lsof -i TCP:$1) ]]; then
        echo ""
        echo "ERROR: $1 port already in use"
        exit 1
    fi
}

check_all_ports()
{
    check_port ${port}
    check_port ${rpcport}
    check_port ${elvport}
    check_port ${qfabport}

    if [[ ${create_peer} -eq 1 ]]; then

        # check the elvmaster port are same as peer ports
        if [[ ${peer_port} -eq ${port} ]];then
            echo ""
            echo "ERROR: elvmaster-port same as peer port, ${peer_port}"
            exit 1
        fi

        if [[ ${peer_rpcport} -eq ${rpcport} ]];then
            echo ""
            echo "ERROR: elvmaster-rpcport same as peer rpcport, ${peer_rpcport}"
            exit 1
        fi

        if [[ ${peer_elvport} -eq ${elvport} ]];then
            echo ""
            echo "ERROR: elvmaster-elvport same as peer elvport, ${peer_elvport}"
            exit 1
        fi

        check_port ${peer_port}
        check_port ${peer_rpcport}
        check_port ${peer_elvport}
    fi
}

#--------------------------------------------------------

# ********** elvmasterd ************

elvmasterd_wallet_create()
{
    local ret
    echo ""
    echo "STARTING 'elvmasterd wallet create' command..."

    if [[ -n ${2+x} ]]; then
        if [[ "$2" == "dev" ]]; then
            echo "in dev mode..."
            ${elvmasterd} wallet create dev --config="$1"
            ret=$?
        fi
    else
        echo "for elv-master peer..."
        ${elvmasterd} wallet create --config="$1"
        ret=$?
    fi

    if [[ $ret -ne 0 ]]; then
            echo "FAILED : elvmasterd wallet create, please check the logs."
            exit 1
    fi
}

elvmasterd_init()
{
    local ret
    echo ""
    echo "STARTING 'elvmasterd init' command..."

    if [[ -n ${2+x} ]]; then
        if [[ "$2" == "dev" ]]; then
            echo "in dev mode..."
            ${elvmasterd} init dev --config="$1"
            ret=$?
        fi
    else
        echo "in elv-master peer..."
        ${elvmasterd} init --config="$1"
        ret=$?
    fi

    if [[ $ret -ne 0 ]]; then
        echo "FAILED: elvmasterd init, please check the logs"
        exit 1
    fi
}

    elvmasterd_start()
{
    local ret
    echo ""
    echo "STARTING 'elvmasterd start' command..."

    if [[ -n ${2+x} ]]; then
        if [[ "$2" == "dev" ]]; then
            echo "in dev mode..."
            ${elvmasterd} start dev --config="$1" &
            ret=$?
        fi
    else
        echo "for elv-master peer..."
        ${elvmasterd} start --config="$1" &
        ret=$?
    fi

    if [[ $ret -ne 0 ]]; then
        echo "FAILED: elvmasterd start, please check the logs"
        exit 1
    fi
}

elvmasterd_dev_config()
{
    echo -e "\n\
[node]\n\
log_file=\"${2}\"\n\
datadir=\"${3}\"\n\
nodekey=true\n\
port=${port}\n\
rpcport=${rpcport}\n\
elvport=${elvport}\n\
networkid=${network_id}\n\
\n\
[svc_config]\n\
fabric_url=\"${qfab_url}\"\n\
\n\
[genesis]\n\
chainid=${chain_id}\n\
" > ${1}
}


elvmasterd_peer_config()
{
    echo -e "\n\
enc_block=\"${peer_enc_block}\"\n\
\n\
[node]\n\
port=${peer_port}\n\
rpcport=${peer_rpcport}\n\
elvport=${peer_elvport}\n\
log_file=\"${2}\"\n\
datadir=\"${3}\"\n\
staticnodes=\"${static_nodes}\"\n\
networkid=${network_id}\n\
\n\
[hdwallet]\n\
mnemonic=\"${peer_mnemonic}\"\n\
passphrase=\"${peer_passphrase}\"\n\
accounts=${peer_accounts}\n\
" > ${1}
}


#--------------------------------------------------------------

#************* qfab_cli ********************

qfab_cli_config()
{
    touch "${1}"
    chmod 600 "${1}"

    qfab_cli_config_data=$( jq -n \
                  --arg eth_url "${eth_url}" \
                  --arg qfab_url "${qfab_url}" \
                  --arg secret "${2}" \
         '{
  "space_id": "",
  "api": {
    "url": $qfab_url
  },
  "fs": "os",
  "ethereum": {
  "url": $eth_url,
  "private_key": $secret
  },
  "log": {
    "level": "warn",
    "formatter": "console",
    "named": {
      "/cli": {
        "level": "warn",
        "formatter": "console"
      },
      "/cli-result": {
        "level": "normal",
        "formatter": ""
      }
    }
  }
}'
)
    echo "${qfab_cli_config_data}" > "${1}"
}

qfab_cli_space_create()
{
    out="$(${qfab_cli} space create --config "${1}")"
    if [[ $? -eq 0 ]]; then
        echo "$out"
        echo "SUCCESS: content space created, SPACE_ID = ${out}"
    else
         echo ""
         echo "FAILED: space create..."
         echo "$out"
         exit 1
    fi

    spaceid="${out%\"}"
    spaceid="${spaceid#\"}"
    jq --arg space "${spaceid}" '.space_id = $space' "${1}" > temp.json && mv temp.json "${1}"
    chmod 600 "${1}"
    jq --arg space "${spaceid}" '.space_id = $space' "${2}" > temp.json && mv temp.json "${2}"
    chmod 600 "${2}"
    jq --arg space "${spaceid}" '.space_id = $space' "${3}" > temp.json && mv temp.json "${3}"
    chmod 600 "${3}"
}

qfab_cli_node_add()
{
    out="$(${qfab_cli} space node add "$1" fab+"$2" eth+"$3" --config "$4" --kms "$5")"
    if [[ $? -eq 0 ]]; then
        echo ""
        echo "SUCCESS: space node added..."
        echo "$out"
    else
        echo ""
        echo "FAILED: space node add..."
        echo "$out"
        exit 1
    fi
}

qfab_cli_node_remove()
{
    out="$(${qfab_cli} space node remove "$1" --config "$2")"
    if [[ $? -eq 0 ]]; then
        echo ""
        echo "SUCCESS: space node removed..."
        echo "$out"
    else
        echo ""
        echo "FAILED: space node removed..."
        echo "$out"
        exit 1
    fi
}

qfab_cli_kms_add()
{
    out="$(${qfab_cli} space kms add "$1" "$2" --pubkey "$3" --config "$4")"
    if [[ $? -eq 0 ]]; then
        echo ""
        echo "SUCCESS: space kms added..."
        echo "$out"

    else
        echo ""
        echo "FAILED: space kms add..."
        echo "$out"
        exit 1
    fi

}

qfab_cli_library_create()
{
    out="$(${qfab_cli} library create --kms="$1" --config "$2")"
    if [[ $? -eq 0 ]]; then
        # get library id
        lib="${out%ilib*}"
        if [[ "$lib" != "$out" ]]; then
           libraryid="$(echo "${out:${#lib}}" | cut -d' ' -f 1)"
           libraryid="${libraryid%??}"
        fi
        echo ""
        echo "SUCCESS: space library created, LIBRARY_ID = ${libraryid}"
    else
        echo ""
        echo "FAILED: library create..."
        echo "$out"
        exit 1
    fi
}

qfab_cli_space_bitcode()
{
    out="$(${qfab_cli} space bitcode "" --config "$1")"
    if [[ $? -eq 0 ]]; then
        echo ""
        echo "SUCCESS: space bitcode..."
        echo "$out"
     else
        echo ""
        echo "FAILED: space bitcode..."
        echo "$out"
        exit 1
    fi
}

qfab_cli_submit()
{
    out="$(${qfab_cli} submit "$1" --library="$2" --type="$3" --config="$4")"
    if [[ $? -eq 0 ]]; then
        echo ""
        echo "SUCCESS: submit content objects..."
        echo "$out"
     else
        echo ""
        echo "FAILED: submit content objects..."
        echo "$out"
        exit 1
    fi
}

#------------------------------------------------------------

# ******************* qfab *******************

# start qfab
qfab_start()
{
   echo ""
   echo "STARTING qfab deamon..."
   ${qfab} daemon --config "$1" &
    if [[ $? -ne 0 ]]; then
        echo "FAILED: running qfab..."
        exit 1
    fi
}

qfab_config()
{
    touch ${qfab_config_file} && \
    {
    jq --arg space "$spaceid" '.qspaces[0].id = $space' | \
    jq --arg ethurl "$eth_url" '.qspaces[0].ethereum.url = $ethurl' | \
    jq --arg base_url "$qfab_url" '.api.base_url = $base_url' | \
    jq --arg wallet_file "$1" '.qspaces[0].ethereum.wallet_file = $wallet_file' | \
    jq --argjson nwid $network_id '.qspaces[0].ethereum.network_id = $nwid' | \
    jq --arg logfile "$qfab_log_file" '.log.file.filename = $logfile' | \
    jq --arg nodeid "$qfab_node_id" '.fabric.node_id = $nodeid' | \
    jq --arg install_path "${install_path}" '.paths.install_path = $install_path' | \
    jq --arg config_path "${config_path}" '.paths.config_path = $config_path' | \
    jq --arg qparts_path "${qparts_path}" '.paths.qparts_path = $qparts_path' | \
    jq --arg qtemp_path "${qtemp_path}" '.paths.qtemp_path = $qtemp_path' | \
    jq --arg qlibs_path "${qlibs_path}" '.paths.qlibs_path = $qlibs_path' | \
    jq --arg qnode_path "${qnode_path}" '.paths.node_path = $qnode_path' | \
    jq --arg qcache_path "${qcache_path}" '.paths.cache_path = $qcache_path' | \
    jq --arg avpipe_cache_path "${qfab_dir}/pogreb.db" '.avpipe.cache.path = $avpipe_cache_path' | \
    jq 'del(.qspaces[1,2])'
    } < "$dev_config" > "$qfab_config_file"
}

# --------------------------------------------------------------------

# check all the parameters are provided
if [[ $# -lt 3 ]]; then
help_function
fi

elvmasterd=$1
qfab=$2
qfab_cli=$3
export ELV_WALLET_PASSPHRASE="test"

dir=
create_peer=0
while test $# -gt 3; do
    case "$4" in
        --peer)
            echo "elvmasterd peer generation enabled"
            create_peer=1
            shift
            ;;
        --network-id)
            network_id="$5"
            shift
            shift
            ;;
        --elvmaster-port)
            port="$5"
            shift
            shift
            ;;
        --elvmaster-rpcport)
            rpcport="$5"
            shift
            shift
            ;;
        --elvmaster-elvport)
            elvport="$5"
            shift
            shift
            ;;
        --fabric-port)
            qfabport="$5"
            shift
            shift
            ;;
        --dir)
            dir="$5"
            shift
            shift
            ;;
        --help)
            help_function
            ;;
        *)
          echo "FAILED: invalid input flag..."
          help_function
          ;;
    esac
done

eth_url="http://localhost:${rpcport}"
qfab_url="http://localhost:${qfabport}"

# check if the ports already in use
check_all_ports


# setup folder and files

base_dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
fabric_dir="$(dirname "$base_dir")"
dev_config="$fabric_dir/config/dev-config.json"


if [[ -z ${dir} ]]; then
    #to create ./RUN in cwd
    dir="$(pwd)"
fi
run_dir="${dir}/RUN"
create_dir ${run_dir}


qfab_dir="${run_dir}/QDATA"
create_dir ${qfab_dir}
elvmaster_dir="${run_dir}/elv-master"
create_dir ${elvmaster_dir}
elvmaster_keystore_dir="${run_dir}/elv-master/keystore"
node_wallet="${elvmaster_keystore_dir}/*${qfab_node_account}"

if [[ $create_peer -eq 1 ]]; then
    elvmaster_peer_dir="${run_dir}/elv-master-peer"
    create_dir ${elvmaster_peer_dir}
fi
config_path="${run_dir}/config"
create_dir ${config_path}

install_path="${qfab_dir}"
qparts_path="${qfab_dir}/PARTS"
qtemp_path="${qfab_dir}/TEMP"
qlibs_path="${qfab_dir}/LIBS"
qnode_path="${qfab_dir}/LOCAL"
qcache_path="${qfab_dir}/CACHE"

elvmasterd_dev_config_file="${config_path}/elvmasterd_dev_config.toml"
elvmasterd_log="${run_dir}/elvmasterd.log"

# for peer
if [[ ${create_peer} -eq 1 ]]; then
    elvmasterd_peer_config_file="${config_path}/elvmasterd_peer_config.toml"
    elvmasterd_peer_log="${run_dir}/elvmasterd-peer.log"
fi

qfab_cli_space_owner_config_file="${config_path}/qfab_cli_space_owner.json"
qfab_cli_user_config_file="${config_path}/qfab_cli.json"
qfab_cli_kms_config_file="${config_path}/qfab_cli_kms.json"

# create qfab config file and qfab node private_key file
qfab_log_file="${run_dir}/qfab.log"
qfab_privkey="${config_path}/qfab_privkey.key"
qfab_config_file="${config_path}/qfab.json"

print_input_data


#-----------------------------------------


home_dir=$HOME
default_file="${home_dir}/.eluvio/elvmasterd/config.toml"
# check if elvmasterd config file is present in default location
if test -f ${default_file}; then
    echo ""
    echo "${default_file} EXISTS, please move the config file from its default location"
    exit 1
fi

echo ""
echo "initializing ELVMASTERD..."

elvmasterd_dev_config "${elvmasterd_dev_config_file}" "${elvmasterd_log}" "${elvmaster_dir}"
elvmasterd_wallet_create "${elvmasterd_dev_config_file}" "dev"
elvmasterd_init "${elvmasterd_dev_config_file}" "dev"
elvmasterd_start "${elvmasterd_dev_config_file}" "dev"
P1=$!
echo "$separator1"


# wait for elvmasterd to start
sleep 5

if [[ $create_peer -eq 1 ]]; then
    echo "initializing ELVMASTERD..."
    elvmasterd_peer_config "${elvmasterd_peer_config_file}" "${elvmasterd_peer_log}" "${elvmaster_peer_dir}"
    elvmasterd_wallet_create "${elvmasterd_peer_config_file}"
    elvmasterd_init "${elvmasterd_peer_config_file}"
    elvmasterd_start "${elvmasterd_peer_config_file}"
    P3=$!
    echo "$separator1"
    # wait for elvmasterd to start
    sleep 5
fi

# create qfab_cli config file
qfab_cli_config ${qfab_cli_space_owner_config_file} ${space_owner_private_key}
qfab_cli_config ${qfab_cli_user_config_file} ${user_private_key}
qfab_cli_config ${qfab_cli_kms_config_file} ${kms_private_key}

# create space
echo "Creating space..."
qfab_cli_space_create ${qfab_cli_space_owner_config_file} ${qfab_cli_user_config_file} ${qfab_cli_kms_config_file}
echo "$separator1"

# add kms
echo "Adding kms..."
qfab_cli_kms_add ${kms_id} ${eth_url} ${kms_public_key} ${qfab_cli_space_owner_config_file}
echo "$separator1"

# add node
echo "Adding node..."
qfab_cli_node_add ${qfab_node_id} ${qfab_url} ${eth_url} ${qfab_cli_space_owner_config_file} ${kms_id}
echo "$separator1"

echo ""
echo "QFAB initializing..."
# create qfab_config file
qfab_config ${node_wallet} && \
# start qfab
qfab_start "${qfab_config_file}"
P2=$!
sleep 5 # wait for qfab to start
echo "$separator1"


# create library
echo "Creating library by the space owner..."
qfab_cli_library_create ${kms_id} ${qfab_cli_space_owner_config_file}
echo "$separator1"
echo "Creating library by the user..."
qfab_cli_library_create ${kms_id} ${qfab_cli_user_config_file}
echo "$separator1"

# for creating access wallet for kms
echo "Creating library by the kms..."
qfab_cli_library_create ${kms_id} ${qfab_cli_kms_config_file}
echo "$separator1"


# run space bitcode command
echo "Running space bitcode..."
qfab_cli_space_bitcode "${qfab_cli_space_owner_config_file}"
echo "$separator1"

# ------------------------------------------------

print_output
